import { useEffect, useRef, useState } from 'react';
import type { FileStart } from './types';

const MIN_GAP_MS = 500; // at most 2 new tiles per second
const MAX_TILES = 14;

type Tile = { key: number; src: string; name: string };

/**
 * Thumbnails of files as their copy starts, riding left -> right above the progress bar.
 * Off the copy path: at most one thumbnail request in flight, newest pending start wins,
 * dropped or null thumbnails simply get no tile.
 */
export default function ThumbConveyor() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const state = useRef({ inFlight: false, lastSpawn: 0, pending: null as FileStart | null, seq: 0 });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const s = state.current;

    function pump() {
      if (!alive || s.inFlight || !s.pending) return;
      const wait = s.lastSpawn + MIN_GAP_MS - Date.now();
      if (wait > 0) {
        if (!timer) timer = setTimeout(() => ((timer = null), pump()), wait);
        return;
      }
      const job = s.pending;
      s.pending = null;
      s.inFlight = true;
      window.api
        .getThumbnail(job.absPath)
        .catch(() => null)
        .then((src) => {
          s.inFlight = false;
          if (!alive) return;
          if (src) {
            s.lastSpawn = Date.now();
            const tile = { key: ++s.seq, src, name: job.name };
            setTiles((t) => [...t.slice(-(MAX_TILES - 1)), tile]);
          }
          pump();
        });
    }

    const off = window.api.onFileStart((f) => {
      s.pending = f;
      pump();
    });
    return () => {
      alive = false;
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="conveyor" aria-hidden="true">
      {tiles.map((t) => (
        <div
          key={t.key}
          className="lane"
          onAnimationEnd={() => setTiles((all) => all.filter((x) => x.key !== t.key))}
        >
          <img className="thumb" src={t.src} alt="" title={t.name} />
        </div>
      ))}
    </div>
  );
}
