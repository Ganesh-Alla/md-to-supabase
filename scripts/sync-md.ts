import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";


/* ---------------- Config ---------------- */

const TASKS_DIR = "private_msb";
const DRY_RUN = process.env.DRY_RUN === "true";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL as string, SUPABASE_KEY as string);

/* ---------------- Git Diff ---------------- */

function getChangedMarkdownFiles(): string[] {
    try {
      const output = execSync(
        `git diff --name-only ${process.env.BEFORE_SHA} ${process.env.AFTER_SHA}`
      )
        .toString()
        .trim();
  
      if (!output) return [];
  
      return output
        .split("\n")
        .filter(
          (file) =>
            file.startsWith(`${TASKS_DIR}/`) && file.endsWith(".md")
        );
    } catch {
      // First commit or invalid SHA → fallback
      console.warn("Git diff failed, falling back to full directory scan");
  
      if (!fs.existsSync(TASKS_DIR)) return [];
  
      return fs
        .readdirSync(TASKS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => `${TASKS_DIR}/${f}`);
    }
  }

  function extractVersion(title: string): number {
    const match = title.match(/\(v(\d+)\)/i);
    return match ? parseFloat(match[1]) : 1.0;
  }

  function cleanTitle(title: string): string {
    return title.replace(/\s*\(v\d+\)\s*/i, "").trim();
  }

  function toSlug(input: string): string {
    return input
      .toLowerCase()
      .replace(/\(v\d+\)/i, (m) => m.replace(/[()]/g, "")) // (v2) → v2
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function extractRegistryName(filePath: string): string {
    return filePath.split("/")[0];
  }
    
  

/* ---------------- Markdown Parser ---------------- */

interface ParsedMarkdown {
    name: string;
    version: number;
    description: string;
  }
  

  function parseMarkdown(content: string): ParsedMarkdown {
    const lines = content.split("\n");
  
    let rawTitle = "";
    let descriptionLines: string[] = [];
    let inDescription = false;
  
    // ---- Title (H1 preferred) ----
    for (const line of lines) {
      if (line.startsWith("# ")) {
        rawTitle = line.replace("# ", "").trim();
        break;
      }
    }
  
    if (!rawTitle) {
      for (const line of lines) {
        if (
          line.startsWith("## ") &&
          !line.toLowerCase().includes("description")
        ) {
          rawTitle = line.replace("## ", "").trim();
          break;
        }
      }
    }
  
    // ---- Description ----
    for (const line of lines) {
      const trimmed = line.trim();
  
      if (trimmed.toLowerCase() === "## description") {
        inDescription = true;
        continue;
      }
  
      if (inDescription && /^#{1,6}\s/.test(trimmed)) break;
  
      if (inDescription) descriptionLines.push(line);
    }
  
    const version = extractVersion(rawTitle);
    const clean = cleanTitle(rawTitle);
    const slug = toSlug(rawTitle);
  
    return {
        name: slug,
      version,
      description: descriptionLines.join("\n").trim(),
    };
  }
  
  

/* ---------------- Logger ---------------- */

function logTask(task: {
    registryName: string;
    name: string;
    description: string;
    content: string;
    version: number;
  }) {
    console.log("\n================ TASK PREVIEW ================");
    console.log("Registry Name        :", task.registryName);
    console.log("Name       :", task.name);
    console.log("Description :", task.description);
    // console.log("Content     :", task.content);
    console.log("Version     :", task.version);
    console.log("================================================\n");
  }


  async function insertTask(dbTask: {
    registry_name: string;
    name: string;
    description: string;
    content: string;
    version: number;
  }) {
    if (process.env.DRY_RUN === "true") {
      console.log("DRY RUN → Supabase insert payload:\n", dbTask);
      return;
    }
  
    const { data: registry, error: regErr } = await supabase
      .from("registry")
      .select("id")
      .eq("name", dbTask.registry_name)
      .single();
  
    if (regErr || !registry) {
      throw new Error(`Registry not found: ${dbTask.registry_name}`);
    }
  
    const { error } = await supabase.from("tasks").upsert(
      {
        registry_id: registry.id,
        name: dbTask.name,
        description: dbTask.description,
        content: dbTask.content,
        version: dbTask.version,
      },
      {
        onConflict: "registry_id,name,version",
      }
    );
  
    if (error) throw error;
    console.log("Task inserted successfully", dbTask.name, dbTask.version);
  }
  
  

/* ---------------- Main ---------------- */

async function main() {
  const changedFiles = getChangedMarkdownFiles();

  if (changedFiles.length === 0) {
    console.log("No markdown files changed.");
    return;
  }

  console.log("Changed files detected:", changedFiles);

  for (const file of changedFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const {  description, version, name } = parseMarkdown(content);
    const registryName = extractRegistryName(file);

    
    // logTask({
    //   registryName: registryName,
    //   name: name,
    //   description: description,
    //   content: content,
    //   version: version,
    // });

    if (DRY_RUN) {
      console.log("DRY RUN ENABLED → Skipping DB insert\n");
    }

    await insertTask({
      registry_name: registryName,
      name: name,
      description: description,
      content: content,
      version: version,
    });
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
