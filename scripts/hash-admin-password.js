#!/usr/bin/env node
"use strict";
const crypto = require("node:crypto");
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Password for new Card Stuff Yes admin (input is visible): ", password => {
  rl.close();
  if (password.length < 12 || password.length > 256) {
    console.error("Use a password between 12 and 256 characters.");
    process.exitCode = 1;
    return;
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  console.log("scrypt$" + salt.toString("hex") + "$" + hash.toString("hex"));
});
