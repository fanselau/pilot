import { getConfig } from '../core/config.js';
import { getPilotRuntimeGsdVersion, setApprovedGsdVersion } from '../core/managed-gsd.js';
import { isJsonMode, outputHuman, outputJson } from '../util/output.js';

const DISCOVERY_UNSUPPORTED_MESSAGE = 'Newer versions: not supported in this rollout';
const UPDATE_HINT = 'Run: pilot update';

function usageError(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

async function gsdVersionShowCommand(): Promise<void> {
  const { approvedGsdVersion } = getConfig();
  const runtimeVersion = await getPilotRuntimeGsdVersion();

  if (isJsonMode()) {
    outputJson({
      approvedVersion: approvedGsdVersion,
      runtimeVersion,
      discoverySupported: false,
    });
    return;
  }

  outputHuman('');
  outputHuman(`approved version: ${approvedGsdVersion}`);
  outputHuman(`runtime version: ${runtimeVersion ?? 'not installed'}`);
  outputHuman(DISCOVERY_UNSUPPORTED_MESSAGE);
  outputHuman('');
}

async function gsdVersionSetCommand(version: string): Promise<void> {
  try {
    const approvedVersion = await setApprovedGsdVersion(version);

    if (isJsonMode()) {
      outputJson({
        approvedVersion,
        updated: true,
        nextStep: UPDATE_HINT,
      });
      return;
    }

    outputHuman('');
    outputHuman(`Approved version set to ${approvedVersion}`);
    outputHuman(UPDATE_HINT);
    outputHuman('');
  } catch (error) {
    usageError(error instanceof Error ? error.message : String(error));
  }
}

export { gsdVersionShowCommand, gsdVersionSetCommand };
