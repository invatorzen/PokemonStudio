import React, { useSyncExternalStore } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { SecondaryButton } from '@components/buttons';

import { assetKey } from './types';
import { formatBytes } from './releaseAssetsTree';
import { useReleaseAssets } from './releaseAssetsStore';
import { getReleaseAssetsPending, subscribeReleaseAssetsPending } from './releaseAssetsPendingSave';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.dark18};

  & .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
  }
  & .title {
    ${({ theme }) => theme.fonts.normalMedium};
    color: ${({ theme }) => theme.colors.text100};
  }
  & .warning {
    color: ${({ theme }) => theme.colors.warningBase};
  }
`;

/**
 * Build dialog block: expected release size + what the saved asset selection
 * leaves out, with a shortcut to the Release assets page. The build reads the
 * SAVED selection (release_assets.json), so unsaved changes are called out.
 */
export const ReleaseAssetsBuildSummary = ({ closeDialog }: { closeDialog: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, scan, selection } = useReleaseAssets();
  const pending = useSyncExternalStore(subscribeReleaseAssetsPending, getReleaseAssetsPending);

  let details: React.ReactNode;
  if (!scan) {
    details = <span>{t('ra_dialog_scanning')}</span>;
  } else {
    const excluded = new Set(selection.excluded.map(assetKey));
    const left = selection.enabled ? scan.assets.filter((a) => excluded.has(assetKey(a.path))) : [];
    const leftSize = left.reduce((sum, a) => sum + a.size, 0);
    const assetsTotal = scan.assets.reduce((sum, a) => sum + a.size, 0);
    const o = scan.other;
    const total = assetsTotal - leftSize + o.engine + o.lib + o.data + o.scripts + o.fontsAndShaders;
    details = (
      <>
        <span className="title">{t('ra_dialog_size', { size: formatBytes(total) })}</span>
        <span>
          {!selection.enabled
            ? t('ra_dialog_disabled')
            : left.length
              ? t('ra_dialog_left_out', { count: left.length, size: formatBytes(leftSize) })
              : t('ra_dialog_all')}
        </span>
      </>
    );
  }

  return (
    <Container>
      <div className="text">
        {details}
        {pending && <span className="warning">{t('ra_dialog_unsaved')}</span>}
        {status === 'error' && <span className="warning">{t('ra_error', { error: '' })}</span>}
      </div>
      <SecondaryButton
        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        onClick={() => {
          closeDialog();
          navigate('/dashboard/release-assets');
        }}
      >
        {t('ra_dialog_choose')}
      </SecondaryButton>
    </Container>
  );
};
