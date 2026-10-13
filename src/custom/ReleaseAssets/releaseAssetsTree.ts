import { assetKey, type ReleaseAsset, type ReleaseAssetsScan } from './types';

/** A folder in the release-asset tree. */
export type AssetFolder = {
  name: string;
  /** Lowercase project-relative folder path ("graphics/titles"). */
  key: string;
  folders: AssetFolder[];
  files: ReleaseAsset[];
  /** Every file below this folder (any depth). */
  all: ReleaseAsset[];
  size: number;
};

/** Build the folder tree (graphics/, audio/) from a scan. */
export const buildAssetTree = (scan: ReleaseAssetsScan): AssetFolder[] => {
  const root: AssetFolder = { name: '', key: '', folders: [], files: [], all: [], size: 0 };
  const index = new Map<string, AssetFolder>([['', root]]);
  const folderFor = (dirKey: string, dirPath: string): AssetFolder => {
    const existing = index.get(dirKey);
    if (existing) return existing;
    const cut = dirKey.lastIndexOf('/');
    const parent = folderFor(cut < 0 ? '' : dirKey.slice(0, cut), cut < 0 ? '' : dirPath.slice(0, dirPath.lastIndexOf('/')));
    const folder: AssetFolder = { name: dirPath.slice(dirPath.lastIndexOf('/') + 1), key: dirKey, folders: [], files: [], all: [], size: 0 };
    parent.folders.push(folder);
    index.set(dirKey, folder);
    return folder;
  };
  for (const asset of scan.assets) {
    const cut = asset.path.lastIndexOf('/');
    const dirPath = asset.path.slice(0, cut);
    const folder = folderFor(assetKey(dirPath), dirPath);
    folder.files.push(asset);
    // Count the file in this folder and every ancestor.
    let key: string | null = folder.key;
    while (key !== null) {
      const f = index.get(key) as AssetFolder;
      f.all.push(asset);
      f.size += asset.size;
      key = key === '' ? null : key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
    }
  }
  return root.folders;
};

const UNITS = ['B', 'KB', 'MB', 'GB'];
/** "12.3 MB" */
export const formatBytes = (bytes: number) => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
};
