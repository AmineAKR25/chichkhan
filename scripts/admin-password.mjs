// Prints the values the admin needs: ADMIN_PASSWORD_HASH for a password you
// type (never echoed or stored), and a fresh ADMIN_SESSION_SECRET.
//   npm run admin:password             asks for the password twice
//   npm run admin:password -- --generate   creates a strong random password
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/admin/auth.js";

function ask(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      // Piped input: read one line.
      let text = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => { text += chunk; });
      stdin.on("end", () => resolve(text.split(/\r?\n/)[0]));
      stdin.on("error", reject);
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (key) => {
      for (const char of key) {
        if (char === "\u0003") { // Ctrl+C
          stdout.write("\n");
          process.exit(130);
        } else if (char === "\r" || char === "\n" || char === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        } else if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

let password;
if (process.argv.includes("--generate")) {
  password = randomBytes(18).toString("base64url");
  console.log(`Generated password (shown once, store it in a password manager):\n\n  ${password}\n`);
} else {
  password = await ask("New admin password (at least 12 characters): ");
  if (process.stdin.isTTY && password !== (await ask("Type it again: "))) {
    console.error("The two passwords do not match. Nothing was created.");
    process.exit(1);
  }
}
try {
  const hash = await hashPassword(password);
  console.log("Set these in Vercel (Project → Settings → Environment Variables) or .env.local:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
  console.log("\nAlso set ADMIN_USERNAME. Changing the hash or the secret signs everyone out.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
