// SPDX-License-Identifier: MPL-2.0

import { generateJarManifest } from "./gen_jarmanifest.ts";
import type { Plugin } from "rolldown";

// Use Deno's filesystem API instead of Node's `fs`.
async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

export function genJarmnPlugin(
  prefix: string,
  namespace: string,
  register_type: "content" | "skin" | "resource",
) {
  let rootPath = "";
  return {
    name: "gen_jarmn",
    configResolved(config) {
      rootPath = config.root;
    },
    async generateBundle(options, bundle, isWrite) {
      const _bundle = (await pathExists(rootPath + "/index.html"))
        ? Object.assign(
            { "__index.html__": { fileName: "index.html" } },
            bundle,
          )
        : bundle;
      this.emitFile({
        type: "asset",
        fileName: "jar.mn",
        source: await generateJarManifest(_bundle, {
          prefix,
          namespace,
          register_type,
        }),
      });
      this.emitFile({
        type: "asset",
        fileName: "moz.build",
        source: `JAR_MANIFESTS += ["jar.mn"]`,
      });
    },
  } satisfies Plugin;
}
