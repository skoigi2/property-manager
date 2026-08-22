"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { Play } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  TUTORIAL_VIDEOS,
  type TutorialKey,
} from "@/lib/tutorial-videos";

interface Props {
  tutorialKey: TutorialKey;
  variant?: "inline" | "link";
}

function watchedStorageKey(key: TutorialKey) {
  return `tutorial-watched:${key}`;
}

function readWatched(key: TutorialKey): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(watchedStorageKey(key)) === "1";
  } catch {
    return false;
  }
}

/**
 * Contextual tutorial video. `variant="link"` renders a small
 * "▶ Watch how this works" text button that opens the tutorial in a modal;
 * `variant="inline"` renders the full card (player → summary → steps).
 * Missing media files degrade to the written version — they never break a page.
 */
export function TutorialVideo({ tutorialKey, variant = "link" }: Props) {
  const video = TUTORIAL_VIDEOS[tutorialKey];
  const [open, setOpen] = useState(false);
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    setWatched(readWatched(tutorialKey));
  }, [tutorialKey]);

  const markWatched = useCallback(() => {
    try {
      window.localStorage.setItem(watchedStorageKey(tutorialKey), "1");
    } catch {
      /* private mode — non-fatal */
    }
    setWatched(true);
  }, [tutorialKey]);

  if (!video) return null;

  if (variant === "inline") {
    return <TutorialCard video={video} onWatched={markWatched} />;
  }

  const openModal = () => {
    track("tutorial_open", { key: tutorialKey });
    markWatched();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        data-testid={`tutorial-link-${tutorialKey}`}
        className={`inline-flex items-center gap-1 text-caption font-medium transition-colors ${
          watched
            ? "text-gray-400 hover:text-gray-500"
            : "text-gold hover:text-gold-dark"
        }`}
      >
        <Play size={12} className="shrink-0" />
        Watch how this works
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={video.title} size="3xl">
        {open && <TutorialCard video={video} onWatched={markWatched} inModal />}
      </Modal>
    </>
  );
}

function TutorialCard({
  video,
  onWatched,
  inModal = false,
}: {
  video: (typeof TUTORIAL_VIDEOS)[TutorialKey];
  onWatched: () => void;
  inModal?: boolean;
}) {
  const [videoFailed, setVideoFailed] = useState(video.videoUrl === null);
  const [vttOk, setVttOk] = useState(false);
  const trackedRef = useRef(false);

  // The VTT is optional — probe it once so we never attach a 404ing track.
  useEffect(() => {
    let cancelled = false;
    if (!video.subtitleUrl) return;
    fetch(video.subtitleUrl, { method: "HEAD" })
      .then((r) => !cancelled && setVttOk(r.ok))
      .catch(() => !cancelled && setVttOk(false));
    return () => {
      cancelled = true;
    };
  }, [video.subtitleUrl]);

  const onPlay = () => {
    if (!trackedRef.current) {
      trackedRef.current = true;
      if (!inModal) track("tutorial_open", { key: video.key });
    }
    onWatched();
  };

  const next = video.next ? TUTORIAL_VIDEOS[video.next] : null;

  return (
    <div id={inModal ? undefined : video.key} data-testid={`tutorial-card-${video.key}`}>
      {/* Cue styling — native subtitle rendering must stay legible over dense tables */}
      <style>{`
        video[data-tutorial]::cue {
          font-size: 1rem;
          line-height: 1.4;
          color: #fff;
          background-color: rgba(15, 23, 42, 0.8);
        }
      `}</style>

      {videoFailed ? (
        <div className="rounded-xl overflow-hidden bg-header/5 border border-gray-100">
          {video.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.posterUrl}
              alt=""
              className="w-full aspect-video object-cover opacity-60"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <div className="px-4 py-3 text-body text-gray-500">
            Video coming soon — here&apos;s the written version.
          </div>
        </div>
      ) : (
        <video
          data-tutorial
          controls
          playsInline
          preload="metadata"
          poster={video.posterUrl ?? undefined}
          onError={() => setVideoFailed(true)}
          onPlay={onPlay}
          className="w-full rounded-xl bg-header aspect-video"
        >
          {video.videoUrl && <source src={video.videoUrl} type="video/mp4" />}
          {vttOk && video.subtitleUrl && (
            <track
              kind="subtitles"
              srcLang="en"
              label="English"
              default
              src={video.subtitleUrl}
            />
          )}
        </video>
      )}

      <p className="text-body text-gray-600 mt-4">{video.summary}</p>

      <ol className="mt-4 space-y-2">
        {video.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-gold/15 text-gold text-caption font-medium flex items-center justify-center shrink-0 mt-px">
              {i + 1}
            </span>
            <span className="text-body text-gray-700">{step}</span>
          </li>
        ))}
      </ol>

      {next && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <Link
            href={`/help/tutorials#${next.key}`}
            className="text-caption font-medium text-gold hover:text-gold-dark"
          >
            Next: {next.title} →
          </Link>
        </div>
      )}
    </div>
  );
}
