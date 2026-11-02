// Synthetic, offline GitHub files responses and matching Git patches.
export function modified(filename = "src/example.js", replacement = "new") {
  const patch = "@@ -1 +1 @@\n-old\n+" + replacement;
  return {
    file: { filename, status: "modified", additions: 1, deletions: 1, changes: 2, patch },
    diff:
      "diff --git a/" +
      filename +
      " b/" +
      filename +
      "\nindex 1111111..2222222 100644\n--- a/" +
      filename +
      "\n+++ b/" +
      filename +
      "\n" +
      patch +
      "\n",
  };
}

export function added() {
  const patch = "@@ -0,0 +1 @@\n+new";
  return {
    file: { filename: "new.js", status: "added", additions: 1, deletions: 0, changes: 1, patch },
    diff:
      "diff --git a/new.js b/new.js\nnew file mode 100644\nindex 0000000..2222222\n--- /dev/null\n+++ b/new.js\n" +
      patch +
      "\n",
  };
}

export function removed() {
  const patch = "@@ -1 +0,0 @@\n-old";
  return {
    file: { filename: "old.js", status: "removed", additions: 0, deletions: 1, changes: 1, patch },
    diff:
      "diff --git a/old.js b/old.js\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/old.js\n+++ /dev/null\n" +
      patch +
      "\n",
  };
}

export function renamed() {
  const patch = "@@ -1,2 +1,2 @@\n unchanged\n-old\n+new";
  return {
    file: {
      filename: "new.js",
      previous_filename: "old.js",
      status: "renamed",
      additions: 1,
      deletions: 1,
      changes: 2,
      patch,
    },
    diff:
      "diff --git a/old.js b/new.js\nsimilarity index 50%\nrename from old.js\nrename to new.js\nindex 1111111..2222222 100644\n--- a/old.js\n+++ b/new.js\n" +
      patch +
      "\n",
  };
}

export function multipleHunks() {
  const fixture = modified();
  const extra = "\n@@ -10 +10 @@\n-before\n+after";
  fixture.file.patch += extra;
  fixture.file.additions = 2;
  fixture.file.deletions = 2;
  fixture.file.changes = 4;
  fixture.diff = fixture.diff.slice(0, -1) + extra + "\n";
  return fixture;
}

export function inputFor(...fixtures) {
  return {
    title: "Example change",
    description: "Intent",
    changedFiles: fixtures.length,
    filePages: [fixtures.map(({ file }) => file)],
    diff: fixtures.map(({ diff }) => diff).join(""),
  };
}
