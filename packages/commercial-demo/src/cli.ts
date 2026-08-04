import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { runCommercialDemo } from './run-demo.js';
import { renderDemoRunToConsole } from './render-console.js';
import { renderDemoRunToHtml } from './render-report.js';
import { renderDemoRunToMarkdown } from './render-markdown.js';

/**
 * The five-minute, CTO-facing entrypoint: run the full commercial demo,
 * print the business-readable transcript to the console, and write the same
 * content as a self-contained HTML report and a Markdown report for
 * documentation. Run with `npm run demo` from this package.
 */
async function main(): Promise<void> {
  const run = await runCommercialDemo();

  console.log(renderDemoRunToConsole(run));

  const outputDir = resolve(process.cwd(), 'demo-output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const htmlPath = resolve(outputDir, 'commercial-demo-report.html');
  const markdownPath = resolve(outputDir, 'commercial-demo-report.md');
  writeFileSync(htmlPath, renderDemoRunToHtml(run), 'utf8');
  writeFileSync(markdownPath, renderDemoRunToMarkdown(run), 'utf8');

  console.log(`\nReports written:\n  ${htmlPath}\n  ${markdownPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
