import fs from "fs";
import { execSync } from "child_process";
import path from "path";

/* ---------------- Config ---------------- */

const TASKS_DIR = "private_msb";
const DRY_RUN = process.env.DRY_RUN === "true";

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
  

/* ---------------- Markdown Parser ---------------- */

interface ParsedMarkdown {
  title: string;
  description: string;
}

function parseMarkdown(content: string): ParsedMarkdown {
  const lines = content.split("\n");

  let title = "";
  let description = "";
  let readingDescription = false;

  for (const line of lines) {
    if (
      line.startsWith("## ") &&
      !line.toLowerCase().includes("description") &&
      !title
    ) {
      title = line.replace("## ", "").trim();
      continue;
    }

    if (line.toLowerCase().startsWith("## description")) {
      readingDescription = true;
      continue;
    }

    if (readingDescription) {
      if (line.startsWith("## ")) break;
      description += line + "\n";
    }
  }

  return {
    title,
    description: description.trim(),
  };
}

/* ---------------- Logger ---------------- */

function logTask(task: {
  file: string;
  title: string;
  description: string;
  content: string;
}) {
  console.log("\n================ TASK PREVIEW ================");
  console.log("File        :", task.file);
  console.log("Title       :", task.title);
  console.log("Description :", task.description);
  console.log("Content     :\n", task.content);
  console.log("================================================\n");
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
    const { title, description } = parseMarkdown(content);

    logTask({
      file,
      title,
      description,
      content,
    });

    if (DRY_RUN) {
      console.log("DRY RUN ENABLED → Skipping DB insert\n");
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
