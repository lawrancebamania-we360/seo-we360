import { readFileSync } from "node:fs";

interface T { owner: string; format: string; hubKeyword: string; proposedH1: string; isCalendarOnly?: boolean; }
const tasks: T[] = JSON.parse(readFileSync("scripts/upload-master-brief/sheet-tasks.json", "utf8"));

const allTasks = tasks.filter((t) => !t.isCalendarOnly);
const rahuls = allTasks.filter((t) => t.owner === "Rahul");

console.log(`Rahul tasks in All Deliverables (${rahuls.length}):`);
for (const t of rahuls) console.log(`  ${t.format} · ${t.hubKeyword}`);
console.log();

const needles = ["workforce", "capacity", "benchmark", "investment", "headcount", "planning"];
console.log("All Deliv tasks matching needles (workforce/capacity/benchmark/investment/headcount/planning):");
for (const t of allTasks) {
  const blob = (t.proposedH1 + " " + t.hubKeyword).toLowerCase();
  for (const n of needles) {
    if (blob.includes(n)) { console.log(`  ${t.owner} | ${t.format} · ${t.proposedH1}`); break; }
  }
}
