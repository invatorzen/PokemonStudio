import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataBlockWithTitle, DataFieldsetField, DataGrid } from '@components/database/dataBlocks';
import { StudioMap } from '@modelEntities/map';

import { useMapSettingsConfig } from './mapSettingsConfigStore';
import { MapSettingsDialog, useMapGraphicFiles } from './MapSettingsDialog';

type Props = {
  map: StudioMap;
  disabled?: boolean;
};

/**
 * The per-map "Settings" block on the map Data tab (below Music): shows the map's
 * fog / panorama / battleback graphics and opens the editor on click. Baked into
 * the map via a fork config, so the map always carries them without a
 * parallel-process Change Fog event. Self-contained — owns its dialog state — so
 * the Map page just drops it in.
 */
export const MapSettings = ({ map, disabled }: Props) => {
  const { t } = useTranslation();
  const { getEntry } = useMapSettingsConfig();
  const files = useMapGraphicFiles();
  const [open, setOpen] = useState(false);
  const entry = getEntry(map.id);

  return (
    <>
      <DataBlockWithTitle size="full" title={t('map_settings_section')} disabled={disabled} onClick={() => setOpen(true)}>
        <DataGrid columns="1fr 1fr 1fr">
          <DataFieldsetField label={t('map_settings_panorama')} data={entry.panorama.name || t('map_settings_none')} disabled={!entry.panorama.name} />
          <DataFieldsetField label={t('map_settings_fog')} data={entry.fog.name || t('map_settings_none')} disabled={!entry.fog.name} />
          <DataFieldsetField label={t('map_settings_battleback')} data={entry.battleback.name || t('map_settings_none')} disabled={!entry.battleback.name} />
        </DataGrid>
      </DataBlockWithTitle>
      {open && (
        <MapSettingsDialog
          map={map}
          fogFiles={files.fogFiles}
          panoramaFiles={files.panoramaFiles}
          battlebackFiles={files.battlebackFiles}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
