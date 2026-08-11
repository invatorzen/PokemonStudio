import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { useGlobalState } from '@src/GlobalStateProvider';
import { loadMapPreview, type MapPreview } from '../MapEditor/events/dialog/mapPreview';

/**
 * Read-only render of a project map with an optional highlighted tile. Used two
 * ways in the grotto editor:
 *   - as a small static thumbnail in the Location block (pass `fitWidth`/
 *     `fitHeight`, no `onPick`), and
 *   - as the interactive picker inside the New Grotto window (pass `cellPx` +
 *     `onPick` so a click selects the spawn tile).
 *
 * It reuses `loadMapPreview` (the same detached-canvas renderer the event
 * editor's tile picker uses) so it never touches the live map-editor state.
 */

const Frame = styled.div<{ $interactive: boolean }>`
  position: relative;
  line-height: 0;
  width: max-content;
  ${({ $interactive }) => ($interactive ? 'cursor: crosshair;' : '')}

  canvas {
    display: block;
    image-rendering: pixelated;
    border-radius: 6px;
  }
`;

const Marker = styled.div`
  position: absolute;
  pointer-events: none;
  border: 2px solid ${({ theme }) => theme.colors.primaryBase};
  background: ${({ theme }) => theme.colors.primaryBase}33;
  box-sizing: border-box;
`;

const Message = styled.div`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  padding: 16px;
`;

export type GrottoMapPreviewHandle = {
  /** Map dimensions in tiles, once the preview has loaded (else null). */
  size: { width: number; height: number } | null;
};

type Props = {
  tiledFilename: string;
  marker?: { x: number; y: number } | null;
  /** When provided, clicking a tile calls this with its (x, y). */
  onPick?: (x: number, y: number) => void;
  /** Fixed CSS pixels per tile. Wins over the fit box when set. */
  cellPx?: number;
  /** Otherwise fit the whole map inside this box (CSS px). */
  fitWidth?: number;
  fitHeight?: number;
  /** Notified with the map's tile dimensions once loaded. */
  onSize?: (size: { width: number; height: number }) => void;
};

export const GrottoMapPreview = ({ tiledFilename, marker, onPick, cellPx, fitWidth = 240, fitHeight = 160, onSize }: Props) => {
  const { t } = useTranslation();
  const [{ projectPath }] = useGlobalState();
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    setPreview(null);
    setError(null);
    loadMapPreview(projectPath, tiledFilename, { hideMetadataLayers: true })
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        onSize?.({ width: p.width, height: p.height });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, tiledFilename]);

  // CSS pixels per tile: an explicit cellPx, or the largest cell that fits the
  // whole map inside the fit box (never upscaling past the native tile size).
  const cell = useMemo(() => {
    if (!preview) return 0;
    if (cellPx) return cellPx;
    return Math.max(1, Math.min(fitWidth / preview.width, fitHeight / preview.height, preview.cellSize));
  }, [preview, cellPx, fitWidth, fitHeight]);

  // The preview owns a detached canvas; mount it and scale via CSS.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !preview) return;
    host.replaceChildren(preview.canvas);
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    preview.canvas.style.width = `${preview.width * cell}px`;
    preview.canvas.style.height = `${preview.height * cell}px`;
  }, [preview, cell]);

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!preview || !onPick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left) / cell);
    const ty = Math.floor((e.clientY - rect.top) / cell);
    if (tx < 0 || ty < 0 || tx >= preview.width || ty >= preview.height) return;
    onPick(tx, ty);
  };

  if (error) return <Message>{t('grotto_preview_failed', { error })}</Message>;
  if (!preview) return <Message>{t('grotto_preview_loading')}</Message>;

  return (
    <Frame $interactive={!!onPick} onClick={pick} style={{ width: preview.width * cell, height: preview.height * cell }}>
      <div ref={hostRef} />
      {marker && <Marker style={{ left: marker.x * cell, top: marker.y * cell, width: cell, height: cell }} />}
    </Frame>
  );
};
