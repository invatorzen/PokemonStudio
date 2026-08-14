import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor, PageTemplate } from '@components/pages';
import { DarkButton } from '@components/buttons';
import { isOnlineAdminConfigured } from '@utils/onlineConfig';
import { showNotification } from '@utils/showNotification';
import {
  listGtsDeposits,
  deleteGtsDeposit,
  getGtsBlacklist,
  addGtsBlacklist,
  removeGtsBlacklist,
  type GtsDepositAdmin,
  type GtsBlacklist,
} from '@utils/onlineApi';
import { GtsDepositCard } from '@components/online/gts/GtsDepositCard';
import { GtsBlacklistEditor } from '@components/online/gts/GtsBlacklistEditor';

const InfoBanner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.warningSoft};
  color: ${({ theme }) => theme.colors.text100};
  ${({ theme }) => theme.fonts.normalMedium};
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
`;

const EmptyState = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

const ErrorText = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.dangerBase};
`;

const DangerButton = styled.button`
  background-color: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.dangerBase};
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  ${({ theme }) => theme.fonts.normalMedium};

  &:hover {
    background-color: ${({ theme }) => theme.colors.dangerHover};
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const GhostButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  color: ${({ theme }) => theme.colors.text100};
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  ${({ theme }) => theme.fonts.normalMedium};
`;

const parseServerError = (result: { body: unknown; error?: string; status: number }): string => {
  const body = result.body as { error?: string; message?: string } | string | null;
  if (body && typeof body === 'object') return body.error ?? body.message ?? result.error ?? `HTTP ${result.status}`;
  if (typeof body === 'string' && body.length > 0) return body;
  return result.error ?? `HTTP ${result.status}`;
};

type DepositsState = { status: 'idle' | 'loading' } | { status: 'ok'; deposits: GtsDepositAdmin[] } | { status: 'error'; message: string };
type BlacklistState = { status: 'idle' | 'loading' } | { status: 'ok'; blacklist: GtsBlacklist } | { status: 'error'; message: string };

export const OnlineGtsPage = () => {
  const { t } = useTranslation();
  const [adminReady, setAdminReady] = useState<boolean>(() => isOnlineAdminConfigured());
  const [deposits, setDeposits] = useState<DepositsState>({ status: 'idle' });
  const [blacklist, setBlacklist] = useState<BlacklistState>({ status: 'idle' });
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [blacklistBusy, setBlacklistBusy] = useState(false);

  const fetchDeposits = useCallback(async () => {
    setDeposits({ status: 'loading' });
    const result = await listGtsDeposits();
    if (!result.ok) return setDeposits({ status: 'error', message: parseServerError(result) });
    setDeposits({ status: 'ok', deposits: Array.isArray(result.body) ? (result.body as GtsDepositAdmin[]) : [] });
  }, []);

  const fetchBlacklist = useCallback(async () => {
    setBlacklist({ status: 'loading' });
    const result = await getGtsBlacklist();
    if (!result.ok) return setBlacklist({ status: 'error', message: parseServerError(result) });
    const body = result.body as GtsBlacklist;
    setBlacklist({ status: 'ok', blacklist: { envSpecies: body?.envSpecies ?? [], customSpecies: body?.customSpecies ?? [] } });
  }, []);

  const refresh = useCallback(() => {
    if (!isOnlineAdminConfigured()) {
      setAdminReady(false);
      return;
    }
    setAdminReady(true);
    void fetchDeposits();
    void fetchBlacklist();
  }, [fetchDeposits, fetchBlacklist]);

  useEffect(() => {
    // Async IIFE so the initial state updates happen off the effect's sync body.
    void (async () => {
      if (!isOnlineAdminConfigured()) {
        setAdminReady(false);
        return;
      }
      setAdminReady(true);
      await Promise.all([fetchDeposits(), fetchBlacklist()]);
    })();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, fetchDeposits, fetchBlacklist]);

  const removeDeposit = async (deposit: GtsDepositAdmin) => {
    setConfirmId(null);
    setMutatingId(deposit._id);
    const result = await deleteGtsDeposit(deposit._id);
    if (result.ok || result.status === 404) {
      setDeposits((prev) => (prev.status === 'ok' ? { status: 'ok', deposits: prev.deposits.filter((d) => d._id !== deposit._id) } : prev));
      showNotification('success', t('gts_title'), t('gts_deposit_removed'));
    } else {
      showNotification('danger', t('gts_title'), parseServerError(result));
    }
    setMutatingId(null);
  };

  const addToBlacklist = async (speciesId: string) => {
    setBlacklistBusy(true);
    const result = await addGtsBlacklist(speciesId);
    if (result.ok) {
      showNotification('success', t('gts_title'), t('gts_blacklist_added'));
      await fetchBlacklist();
    } else {
      showNotification('danger', t('gts_title'), parseServerError(result));
    }
    setBlacklistBusy(false);
  };

  const removeFromBlacklist = async (speciesId: string) => {
    setBlacklistBusy(true);
    const result = await removeGtsBlacklist(speciesId);
    if (result.ok) {
      showNotification('success', t('gts_title'), t('gts_blacklist_removed'));
      await fetchBlacklist();
    } else {
      showNotification('danger', t('gts_title'), parseServerError(result));
    }
    setBlacklistBusy(false);
  };

  const depositsLoading = deposits.status === 'loading';

  return (
    <PageTemplate title={t('gts_title')} size="default">
      {!adminReady && (
        <InfoBanner>
          <strong>{t('online_admin_not_configured')}</strong>
          <span>{t('online_admin_not_configured_hint')}</span>
        </InfoBanner>
      )}

      <PageEditor title={t('gts_deposits')} editorTitle={t('gts_title')} canCollapse>
        <Toolbar>
          <DarkButton onClick={refresh} disabled={depositsLoading || !adminReady}>
            {depositsLoading ? t('gts_loading') : t('gts_refresh')}
          </DarkButton>
        </Toolbar>
        {deposits.status === 'error' && <ErrorText>{t('gts_deposits_error', { error: deposits.message })}</ErrorText>}
        {deposits.status === 'ok' && deposits.deposits.length === 0 && <EmptyState>{t('gts_deposits_empty')}</EmptyState>}
        {deposits.status === 'ok' && deposits.deposits.length > 0 && (
          <List>
            {deposits.deposits.map((d) => (
              <GtsDepositCard
                key={d._id}
                deposit={d}
                actions={
                  confirmId === d._id ? (
                    <>
                      <DangerButton onClick={() => removeDeposit(d)} disabled={mutatingId === d._id}>
                        {mutatingId === d._id ? t('gts_removing') : t('gts_confirm_remove')}
                      </DangerButton>
                      <GhostButton onClick={() => setConfirmId(null)}>{t('gts_cancel')}</GhostButton>
                    </>
                  ) : (
                    <DangerButton onClick={() => setConfirmId(d._id)} disabled={mutatingId !== null}>
                      {t('gts_remove')}
                    </DangerButton>
                  )
                }
              />
            ))}
          </List>
        )}
      </PageEditor>

      <PageEditor title={t('gts_blacklist')} editorTitle={t('gts_title')} canCollapse>
        {blacklist.status === 'error' && <ErrorText>{t('gts_blacklist_error', { error: blacklist.message })}</ErrorText>}
        {blacklist.status === 'ok' && (
          <GtsBlacklistEditor blacklist={blacklist.blacklist} busy={blacklistBusy} onAdd={addToBlacklist} onRemove={removeFromBlacklist} />
        )}
      </PageEditor>
    </PageTemplate>
  );
};
