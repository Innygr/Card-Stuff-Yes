"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const migrationPath = path.join(__dirname, "..", "migrations", "007_community_server_moderation_events.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("community moderation history migration keeps events append-only", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS csy_private\.community_server_moderation_events/i);
    assert.match(sql, /action IN \('approved', 'revoked'\)/i);
    assert.match(sql, /BEFORE UPDATE OR DELETE ON csy_private\.community_server_moderation_events/i);
    assert.match(sql, /RAISE EXCEPTION 'community server moderation events are append-only'/i);
    assert.match(sql, /REVOKE ALL ON TABLE csy_private\.community_server_moderation_events FROM PUBLIC/i);
    assert.match(sql, /REVOKE ALL ON FUNCTION csy_private\.reject_community_server_event_mutation\(\) FROM PUBLIC/i);
    assert.match(sql, /REVOKE ALL ON SEQUENCE csy_private\.community_server_moderation_events_event_id_seq FROM PUBLIC/i);
});

test("community moderation event history is not cascade-deleted with a registry row", () => {
    const createTable = sql.match(/CREATE TABLE IF NOT EXISTS csy_private\.community_server_moderation_events \(([\s\S]*?)\);/i)?.[1] || "";
    assert.match(createTable, /server_id varchar\(128\) NOT NULL/i);
    assert.doesNotMatch(createTable, /REFERENCES\s+csy_private\.community_servers/i);
    assert.doesNotMatch(createTable, /ON DELETE\s+CASCADE/i);
});
