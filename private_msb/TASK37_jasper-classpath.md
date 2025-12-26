# Jasper Reports Classpath Configuration for WildFly Compatibility

## Description

When migrating from JBoss to WildFly, the JasperReports library failed to compile reports at runtime. The issue was caused by the missing classpath configuration for Jasper's compilation environment. Without explicitly setting the `jasper.reports.compile.class.path` system property, the report compilation process could not locate necessary classes and dependencies, causing report generation failures.

This affected critical report generation functionality including Activity Reports, Pivot Reports, and Customer Survey Reports.

## Steps to Reproduce

1. Deploy application to WildFly server
2. Attempt to generate any report (Activity Report, Pivot Report, Customer Survey Report)
3. Observe that report generation fails with compilation errors
4. Check WildFly logs for Jasper compilation errors

## Expected Behavior

When generating reports, Jasper should successfully compile the report templates and return the generated reports without errors. The classpath should be properly configured for the report compilation process.

## Actual Behavior

Report generation fails during the Jasper compilation phase. The error occurs because the `jasper.reports.compile.class.path` system property is not set, preventing Jasper from locating required classes during report compilation.

## Solution

Set the Jasper system property in three report generation methods:
- `getActivityReport()`
- `getPivotReport()`
- `getCustomerSurveyReport()`

The property is set using: `System.setProperty("jasper.reports.compile.class.path", <classpath>)`

This ensures that when Jasper compiles reports at runtime, it has access to all necessary classes and libraries in the classpath.

## Related Issue

- Issue #36: JasperReports compilation failures after JBoss to WildFly migration

## Environment

- Application: VL-UI WildFly
- Component: Report Generation System
- Server: WildFly Application Server
- Library: JasperReports
