import fs from "node:fs";
import path from "node:path";

export type ContextEntry = {
  uri: string;
  type: "file" | "dir";
  size: number;
};

export class ContextFS {
  root: string;
  constructor(root?: string) {
    const base = root || process.env.CONTEXT_FS_ROOT || path.resolve(process.cwd(), ".contextfs");
    this.root = base;
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
  }
  async addResource(p: string, data?: string | object): Promise<string> {
    const full = path.resolve(this.root, p);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = typeof data === "string" ? data : JSON.stringify(data ?? {}, null, 2);
    await fs.promises.writeFile(full, content);
    return full;
  }
  async read(uri: string): Promise<string> {
    const full = path.resolve(this.root, uri);
    return await fs.promises.readFile(full, "utf-8");
  }
  async ls(uri = "."): Promise<ContextEntry[]> {
    const full = path.resolve(this.root, uri);
    if (!fs.existsSync(full)) return [];
    const items = await fs.promises.readdir(full, { withFileTypes: true });
    return items.map(d => {
      const f = path.join(full, d.name);
      const s = fs.statSync(f);
      return { uri: path.relative(this.root, f), type: d.isDirectory() ? "dir" : "file", size: s.size };
    });
  }
  async overview(uri = "."): Promise<{ count: number; files: number; dirs: number }> {
    const list = await this.ls(uri);
    const files = list.filter(i => i.type === "file").length;
    const dirs = list.filter(i => i.type === "dir").length;
    return { count: list.length, files, dirs };
  }
  async search(query: string, uri = "."): Promise<ContextEntry[]> {
    const res: ContextEntry[] = [];
    const full = path.resolve(this.root, uri);
    const walk = (p: string) => {
      const items = fs.readdirSync(p, { withFileTypes: true });
      for (const d of items) {
        const f = path.join(p, d.name);
        if (d.isDirectory()) walk(f);
        else {
          const text = fs.readFileSync(f, "utf-8");
          if (text.includes(query)) {
            const s = fs.statSync(f);
            res.push({ uri: path.relative(this.root, f), type: "file", size: s.size });
          }
        }
      }
    };
    if (fs.existsSync(full)) walk(full);
    return res;
  }
}

export const getContextFS = () => new ContextFS();
