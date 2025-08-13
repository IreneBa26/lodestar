/**
 * Loader for YAML input into a KurtosisNetworkConfig
 * Used with *.test.ts files and during the testing phase
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { KurtosisNetworkConfig } from "./kurtosisTypes";

export async function loadKurtosisConfig(
  fileName: string,
  baseDir = path.resolve(__dirname, "../../../sim/configs") //move the baseDir inside? and hardcode CONFIG_DIR? will the file path remain the same?
): Promise<KurtosisNetworkConfig> {
  const fullPath = path.join(baseDir, fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return parse(raw) as KurtosisNetworkConfig; //TODO: error catch needed?
}

//move the baseDir inside taking inspo from this code snippet?
/*
export class KurtosisConfigLoader {
  private static readonly CONFIG_DIR = "./test/sim/configs";
  
  static loadConfig(configName: string): KurtosisNetworkConfig {
    const configPath = resolve(this.CONFIG_DIR, `${configName}.yml`);
    const yamlContent = readFileSync(configPath, 'utf8');
    return yamlLoad(yamlContent) as KurtosisNetworkConfig;
    }
  }
}
*/