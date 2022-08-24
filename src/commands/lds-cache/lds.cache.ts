import { fsa } from '@chunkd/fs';
import { command, option, optional, string } from 'cmd-ts';
import * as stac from 'stac-ts';
import { createGunzip } from 'zlib';
import { registerFileSystem } from '../../fs.register.js';
import { logger, registerLogger } from '../../log.js';
import { config, verbose } from '../common.js';

function getTargetPath(source: string, path: string): string {
  if (path.startsWith('./')) return fsa.join(source, path.slice(2));
  throw new Error('No relative path found: ' + path);
}

export const commandLdsFetch = command({
  name: 'lds-fetch-layer',
  args: {
    config,
    verbose,
    version: option({ type: optional(string), long: 'version', description: 'Layer version to download' }),
    layerId: option({ type: string, long: 'layer-id', description: 'Layer to download' }),
    target: option({ type: string, long: 'target', description: 'Target location to save file' }),
  },
  handler: async (args) => {
    registerLogger(args);
    registerFileSystem(args);

    const layerId = args.layerId;
    const layerVersion = args.version;

    if (isNaN(Number(layerId))) throw new Error('Invalid LayerId:' + layerId);
    logger.info({ layerId, layerVersion }, 'Collection:Download:Start');

    if (args.version != null) {
      if (isNaN(Number(layerVersion))) throw new Error('Invalid LayerVersion:' + layerVersion);
      const source = `s3://linz-lds-cache/${layerId}/${layerId}_${layerVersion}.gpkg`;
      await fsa.head(source); // Ensure we have read permission for the source

      logger.info({ layerId, layerVersion, source }, 'Collection:Item:Fetch');
      await fsa.write(args.target ?? `./${layerId}_${layerVersion}.gpkg`, fsa.stream(source).pipe(createGunzip()));
    }

    const collectionJson = await fsa.readJson<stac.StacCollection>(`s3://linz-lds-cache/${layerId}/collection.json`);
    logger.info({ layerId, title: collectionJson.title }, 'Collection:Download:Done');

    const lastItem = collectionJson.links.filter((f) => f.rel === 'item').pop();
    if (lastItem == null) throw new Error('No items found');

    const targetFile = args.target ?? lastItem.href.replace('.json', '.gpkg');

    const targetPath = getTargetPath(`s3://linz-lds-cache/${layerId}/`, lastItem.href).replace('.json', '.gpkg');
    logger.info({ layerId, lastItem, source: targetPath }, 'Collection:Item:Fetch');
    await fsa.write(targetFile, fsa.stream(targetPath).pipe(createGunzip()));
  },
});
