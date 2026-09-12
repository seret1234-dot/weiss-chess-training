import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { classifyKillBoxStoredPuzzle } from "./lib/kill-box-subpattern-assignment.mjs"

const root = process.cwd()
const distances = [1, 2, 3, 4, 5]
const expected = {
  "kill-box-adjacent-rook": [881, 946, 614, 94, 18],
  "kill-box-rook-rail": [296, 347, 81, 24, 2],
  "kill-box-queen-fence": [190, 161, 125, 24, 11],
  "kill-box-unclassified": [133, 46, 46, 12, 5],
}

const sourceIds = new Set()
const assignedIds = new Map(Object.keys(expected).map((slug) => [slug, new Set()]))
const actual = Object.fromEntries(Object.keys(expected).map((slug) => [slug, [0, 0, 0, 0, 0]]))
const assignmentsByPuzzleId = new Map()

for (const distance of distances) {
  const directory = resolve(root, `public/data/pattern-mates/kill-box/mate-in-${distance}`)
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"))
  for (const file of manifest.files) {
    const records = JSON.parse(await readFile(resolve(directory, file), "utf8"))
    for (const record of records) {
      const id = String(record.puzzleId ?? record.id)
      assert.ok(id, `Source record in ${file} must have an ID`)
      assert.ok(!sourceIds.has(id), `Duplicate original source ID ${id}`)
      sourceIds.add(id)
      const assignment = classifyKillBoxStoredPuzzle(record)
      assignmentsByPuzzleId.set(id, assignment.slug)
      assert.ok(assignedIds.has(assignment.slug), `Unexpected assignment ${assignment.slug}`)
      assert.ok(!assignedIds.get(assignment.slug).has(id), `Duplicate assignment ${id}`)
      assignedIds.get(assignment.slug).add(id)
      actual[assignment.slug][distance - 1] += 1
    }
  }
}

assert.equal(sourceIds.size, 4056, "All original Kill Box source IDs must be present")
assert.deepEqual(actual, expected, "The deterministic audited subtype matrix must reconcile exactly")
assert.equal([...assignedIds.values()].reduce((total, ids) => total + ids.size, 0), 4056, "Every source ID must have exactly one assignment")
for (const [id, slug] of Object.entries({
  GgTiw: "kill-box-adjacent-rook",
  DEftU: "kill-box-adjacent-rook",
  eoSk2: "kill-box-rook-rail",
  KuIuK: "kill-box-rook-rail",
  fuP5e: "kill-box-queen-fence",
  G1OJs: "kill-box-queen-fence",
  yQRCK: "kill-box-unclassified",
  jf8Ql: "kill-box-unclassified",
  yWiax: "kill-box-rook-rail",
  xJlpR: "kill-box-queen-fence",
  "7C64u": "kill-box-queen-fence",
  bvLOl: "kill-box-queen-fence",
  tWsUz: "kill-box-queen-fence",
  S3pnZ: "kill-box-queen-fence",
  uFhNN: "kill-box-queen-fence",
  MioO7: "kill-box-queen-fence",
  Jaxqm: "kill-box-queen-fence",
  "9BFOd": "kill-box-queen-fence",
  hzZyZ: "kill-box-queen-fence",
  F12JR: "kill-box-queen-fence",
})) {
  assert.equal(assignmentsByPuzzleId.get(id), slug, `Regression fixture ${id} must classify from the final-board mating piece`)
}

for (const [slug, counts] of Object.entries(expected)) {
  for (const distance of distances) {
    const directory = resolve(root, `public/data/pattern-mates/${slug}/mate-in-${distance}`)
    const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"))
    assert.equal(manifest.totalPuzzles, counts[distance - 1], `${slug} M${distance} total must match`)
    assert.equal(manifest.trainingActive, slug !== "kill-box-unclassified", `${slug} active flag must be correct`)
    const payloadIds = new Set()
    for (const file of manifest.files) {
      const records = JSON.parse(await readFile(resolve(directory, file), "utf8"))
      for (const record of records) payloadIds.add(String(record.puzzleId ?? record.id))
    }
    assert.equal(payloadIds.size, counts[distance - 1], `${slug} M${distance} payload must parse without duplicate IDs`)
  }
}

const source = await readFile(resolve(root, "src/AppRouter.tsx"), "utf8")
assert.match(source, /path="\/mates\/:level\/kill-box" element=\{<KillBoxSubtypePage \/>\}/, "The active Kill Box family URL must render its selector")
assert.doesNotMatch(source, /LegacyKillBoxRouteRedirect/, "The active Kill Box family URL must not be intercepted by a legacy redirect")
assert.match(source, /KillBoxSubtypePage/, "Subtype routes must use the normal trainer page")
assert.doesNotMatch(source, /element=\{<KillBoxMateIn[1-5]Page/, "The broad mixed course must not remain active")

const killBoxPage = await readFile(resolve(root, "src/KillBoxSubtypePage.tsx"), "utf8")
assert.match(killBoxPage, /if \(!subpattern\) return <KillBoxFamilyPage level=\{level\} \/>/, "The family URL must render the subtype selector")
assert.match(killBoxPage, /routeSubpattern\?\.replace\(\/\^kill-box-\//, "Subtype routes must normalize the public kill-box-* route segment before configuration lookup")
assert.match(killBoxPage, /MateThemeSelectionPage/, "The family selector must reuse the normal Mate theme-page shell")
assert.match(killBoxPage, /parentHref=\{\`\/mates\/\$\{level\}\`\}/, "The family selector Back control must use its explicit Mate-in-N parent")
for (const distance of distances) {
  assert.match(killBoxPage, new RegExp(`"m${distance}"`), `Mate in ${distance} must support the Kill Box family selector`)
}
for (const subpattern of ["adjacent-rook", "rook-rail", "queen-fence"]) {
  assert.match(killBoxPage, new RegExp(`kill-box-${subpattern}`), `${subpattern} must navigate to its normal trainer route`)
}

const pages = await readFile(resolve(root, "src/trainers/patternMate/pageConfigs.ts"), "utf8")
assert.doesNotMatch(pages, /killBoxMate[1-5]/, "No active broad Kill Box page config may remain")
assert.match(pages, /backHref: \`\/mates\/m\$\{mateDistance\}\/kill-box\`/, "Each subtype trainer must use the explicit Kill Box family parent")
for (const slug of ["kill-box-adjacent-rook", "kill-box-rook-rail", "kill-box-queen-fence"]) {
  assert.match(pages, new RegExp(slug), `${slug} must have a separate progress namespace`)
}

const mateDistancePage = await readFile(resolve(root, "src/MateDistancePage.tsx"), "utf8")
const mateThemeLayout = await readFile(resolve(root, "src/MateThemeSelectionPage.tsx"), "utf8")
const pageFactory = await readFile(resolve(root, "src/trainers/patternMate/createPatternMatePage.tsx"), "utf8")
const trainer = await readFile(resolve(root, "src/trainers/patternMate/PatternMateTrainer.tsx"), "utf8")
const trainerShell = await readFile(resolve(root, "src/components/trainer/TrainerShell.tsx"), "utf8")
const globalBackButton = await readFile(resolve(root, "src/components/GlobalBackButton.tsx"), "utf8")
assert.match(mateDistancePage, /MateThemeSelectionPage/, "Normal Mate distance pages must use the shared selection shell")
assert.match(mateThemeLayout, /useHierarchicalNavigation/, "Shared selection controls must use the hierarchy-aware navigation mechanism")
assert.match(mateThemeLayout, /backToParent\(parentHref\)/, "Shared selection Back controls must use the explicit parent hierarchy")
assert.match(pageFactory, /backHref: config\.backHref/, "The page factory must forward explicit parent routes")
assert.match(trainer, /onBack=\{config\.backHref \? \(\) => backToParent\(config\.backHref\) : undefined\}/, "Subtype trainers must receive hierarchy-aware Back handling")
assert.match(trainerShell, /onClick=\{onBack\}/, "Trainer Back controls must delegate to the unified hierarchy mechanism")
assert.match(globalBackButton, /usesExplicitMateHierarchyBack/, "History-dependent global Back must defer to the explicit Mate hierarchy")
assert.match(globalBackButton, /kill-box\(\?:-\(adjacent-rook\|rook-rail\|queen-fence\)\)\?/, "Global Back must be suppressed for the Kill Box family and subtype routes")

const catalog = await readFile(resolve(root, "src/training/trainerCatalog.ts"), "utf8")
assert.doesNotMatch(catalog, /trainerKey: "kill-box-mate-[1-5]"/, "The legacy mixed Kill Box stream must not stay Auto-selectable")
for (const slug of ["kill-box-adjacent-rook", "kill-box-rook-rail", "kill-box-queen-fence"]) {
  assert.match(catalog, new RegExp(`${slug}-mate-`), `${slug} must be independently selectable by normal training`)
}

const expectedLearnerCounts = {
  "kill-box-adjacent-rook": [120, 160, 160, 80, 18],
  "kill-box-rook-rail": [120, 160, 80, 20, 2],
  "kill-box-queen-fence": [120, 160, 120, 20, 11],
}
for (const [slug, counts] of Object.entries(expectedLearnerCounts)) {
  for (const distance of distances) {
    const learnerDirectory = resolve(root, `public/data/learner-curricula/pattern-mates/${slug}-m${distance}-v1`)
    const learnerManifest = JSON.parse(await readFile(resolve(learnerDirectory, "manifest.json"), "utf8"))
    assert.equal(learnerManifest.totalPuzzles, counts[distance - 1], `${slug} M${distance} learner overlay keeps its normal focused chunk payload`)
    for (const file of learnerManifest.files) {
      const payload = JSON.parse(await readFile(resolve(learnerDirectory, file), "utf8"))
      assert.ok(Array.isArray(payload.puzzles) && payload.puzzles.length > 0, `${slug} M${distance} learner payload must parse`)
    }
  }
}

console.log(JSON.stringify({ sourceIds: sourceIds.size, actual }))
