#!/usr/bin/env node
"use strict";
const crypto = require("node:crypto");
let password = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { password += chunk; if (password.length > 256) process.exit(1); });
process.stdin.on("end", () => {
  password = password.replace(/[\r\n]+$/, "");
  if (password.length < 12 || password.length > 256) {
    console.error("Password must be between 12 and 256 characters.");
    process.exitCode = 1;
    return;
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  console.log("scrypt:" + salt.toString("hex") + ":" + hash.toString("hex"));
  password = "";
});
