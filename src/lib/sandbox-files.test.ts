// Run with: npm test   (node --test; Node strips the types itself)
import { test } from "node:test"
import assert from "node:assert/strict"
import { canPreview, crumbs, extension, formatSize, kindOf, parentOf, type SandboxEntry } from "./sandbox-files.ts"

const file = (name: string, size = 10): SandboxEntry => ({ name, path: name, type: "file", size, modified: "" })

test("kinds of file, from the extension", () => {
  assert.equal(kindOf({ name: "data", type: "dir" }), "folder")
  assert.equal(kindOf(file("chart.PNG")), "image")
  assert.equal(kindOf(file("report.pdf")), "pdf")
  assert.equal(kindOf(file("sales.xlsx")), "table")
  assert.equal(kindOf(file("main.py")), "text")
  assert.equal(kindOf(file("Makefile")), "text")
  assert.equal(kindOf(file("archive.zip")), "other")
  assert.equal(extension(".env"), "")
})

test("only small text and images are previewed in place", () => {
  assert.ok(canPreview(file("notes.md")))
  assert.ok(canPreview(file("table.csv")))
  assert.ok(canPreview(file("plot.png")))
  assert.ok(!canPreview(file("plot.png", 2 * 1024 * 1024)))
  assert.ok(!canPreview(file("report.pdf")))
  assert.ok(!canPreview({ name: "d", path: "d", type: "dir", size: null, modified: "" }))
})

test("sizes", () => {
  assert.equal(formatSize(null), "")
  assert.equal(formatSize(512), "512 B")
  assert.equal(formatSize(1536), "1.5 KB")
  assert.equal(formatSize(20 * 1024 * 1024), "20 MB")
})

test("the breadcrumb and the parent folder", () => {
  assert.deepEqual(crumbs(""), [])
  assert.deepEqual(crumbs("a/b"), [{ name: "a", path: "a" }, { name: "b", path: "a/b" }])
  assert.equal(parentOf("a/b"), "a")
  assert.equal(parentOf("a"), "")
})
