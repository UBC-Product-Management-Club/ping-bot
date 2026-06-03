import fs from "fs/promises";
import path from "path";

/**
 * Scans all source files for commands and propagates updates to 
 * user-facing documentation in README.md
 */
async function main() {
  const srcDir = path.join(process.cwd(), "src");
  const readmePath = path.join(process.cwd(), "README.md");
  const commandsMdPath = path.join(process.cwd(), "commands.md");

  try {
    const files = await fs.readdir(srcDir);
    const commandsList = [];

    for (const file of files) {
      if (!file.endsWith(".js")) continue;

      const filePath = path.join(srcDir, file);
      const content = await fs.readFile(filePath, "utf8");

      const regex = /\/\*\*(([^*]|\*(?!\/))*)\*\/[\s\r\n]*app\.command\("([^"]+)"/g;
      let match;

      while ((match = regex.exec(content)) !== null) {
        const commentText = match[1];
        const commandName = match[3];
        const lines = commentText
          .split("\n")
          .map((line) => line.replace(/^\s*\*\s?/, "").trim());

        while (lines.length > 0 && lines[0] === "") lines.shift();
        while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

        commandsList.push({
          name: commandName,
          doc: lines.join("\n"),
        });
      }
    }

    commandsList.sort((a, b) => a.name.localeCompare(b.name));

    let generatedMarkdown = "### Team-wide Mentions\n";
    generatedMarkdown += "**Tag all members of a department:** Mention any active department (e.g. `@tech`, `@events`, `@community`) in a message in any channel the bot is a member of.\n\n";
    generatedMarkdown += "### Commands\n";
    for (const cmd of commandsList) {
      generatedMarkdown += `${cmd.doc}\n\n`;
    }

    const commandsMdContent = `# ⚙️ Geary can do:\n\n${generatedMarkdown}`;
    await fs.writeFile(commandsMdPath, commandsMdContent, "utf8");
    console.log("Successfully wrote commands.md");

    if (await fs.stat(readmePath).catch(() => false)) {
      const readmeContent = await fs.readFile(readmePath, "utf8");
      const startTag = "<!-- COMMANDS_START -->";
      const endTag = "<!-- COMMANDS_END -->";

      const startIndex = readmeContent.indexOf(startTag);
      const endIndex = readmeContent.indexOf(endTag);

      if (startIndex !== -1 && endIndex !== -1) {
        const newReadmeContent =
          readmeContent.substring(0, startIndex + startTag.length) +
          "\n\n" +
          generatedMarkdown.trim() +
          "\n\n" +
          readmeContent.substring(endIndex);

        await fs.writeFile(readmePath, newReadmeContent, "utf8");
        console.log("Successfully updated README.md");
      } else {
        console.warn("Could not find start/end tags in README.md");
      }
    }
  } catch (err) {
    console.error("Error generating documentation:", err);
    process.exit(1);
  }
}

main();
