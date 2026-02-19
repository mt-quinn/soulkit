import { invoke } from '@tauri-apps/api/core';

const isTauri = () => '__TAURI_INTERNALS__' in window;

let dataDirCache: string | null = null;

async function getDataDir(): Promise<string> {
  if (dataDirCache) return dataDirCache;
  if (isTauri()) {
    dataDirCache = await invoke<string>('get_data_dir');
  } else {
    dataDirCache = '/soulkit-data';
  }
  return dataDirCache;
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/').replace(/\\/g, '/');
}

// ---- Tauri-backed file operations ----

async function tauriRead(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

async function tauriWrite(path: string, content: string): Promise<void> {
  await invoke<void>('write_file', { path, content });
}

async function tauriDelete(path: string): Promise<void> {
  await invoke<void>('delete_file', { path });
}

async function tauriListDir(path: string): Promise<string[]> {
  return invoke<string[]>('list_dir', { path });
}

async function tauriEnsureDir(path: string): Promise<void> {
  await invoke<void>('ensure_dir', { path });
}

async function tauriExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

async function tauriSaveJsonWithDialog(defaultFileName: string, content: string): Promise<string | null> {
  return invoke<string | null>('save_json_with_dialog', {
    defaultFileName,
    content,
  });
}

// ---- LocalStorage fallback for browser dev ----

function lsKey(path: string): string {
  return `soulkit:${path}`;
}

function localRead(path: string): string {
  const data = localStorage.getItem(lsKey(path));
  if (data === null) throw new Error(`File not found: ${path}`);
  return data;
}

function localWrite(path: string, content: string): void {
  localStorage.setItem(lsKey(path), content);
}

function localDelete(path: string): void {
  localStorage.removeItem(lsKey(path));
}

function localListDir(path: string): string[] {
  const prefix = lsKey(path + '/');
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      if (!rest.includes('/')) {
        keys.push(rest);
      }
    }
  }
  return keys;
}

// ---- Public storage API ----

export const storage = {
  async readJson<T>(relativePath: string): Promise<T> {
    const dir = await getDataDir();
    const fullPath = joinPath(dir, relativePath);
    const content = isTauri() ? await tauriRead(fullPath) : localRead(fullPath);
    return JSON.parse(content);
  },

  async writeJson(relativePath: string, data: unknown): Promise<void> {
    const dir = await getDataDir();
    const fullPath = joinPath(dir, relativePath);
    const content = JSON.stringify(data, null, 2);
    if (isTauri()) {
      await tauriWrite(fullPath, content);
    } else {
      localWrite(fullPath, content);
    }
  },

  async deleteFile(relativePath: string): Promise<void> {
    const dir = await getDataDir();
    const fullPath = joinPath(dir, relativePath);
    if (isTauri()) {
      await tauriDelete(fullPath);
    } else {
      localDelete(fullPath);
    }
  },

  async listDir(relativePath: string): Promise<string[]> {
    const dir = await getDataDir();
    const fullPath = joinPath(dir, relativePath);
    if (isTauri()) {
      return tauriListDir(fullPath);
    } else {
      return localListDir(fullPath);
    }
  },

  async ensureDir(relativePath: string): Promise<void> {
    if (isTauri()) {
      const dir = await getDataDir();
      const fullPath = joinPath(dir, relativePath);
      await tauriEnsureDir(fullPath);
    }
  },

  async exists(relativePath: string): Promise<boolean> {
    const dir = await getDataDir();
    const fullPath = joinPath(dir, relativePath);
    if (isTauri()) {
      return tauriExists(fullPath);
    } else {
      return localStorage.getItem(lsKey(fullPath)) !== null;
    }
  },

  async saveJsonWithDialog(defaultFileName: string, data: unknown): Promise<string | null> {
    const content = JSON.stringify(data, null, 2);

    if (isTauri()) {
      return tauriSaveJsonWithDialog(defaultFileName, content);
    }

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as unknown as {
          showSaveFilePicker: (options?: unknown) => Promise<{
            createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
          }>;
        }).showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [
            {
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return defaultFileName;
      } catch {
        return null;
      }
    }

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = defaultFileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return defaultFileName;
  },
};
