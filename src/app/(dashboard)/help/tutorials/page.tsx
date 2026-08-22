"use client";

import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { TutorialVideo } from "@/components/ui/TutorialVideo";
import { TUTORIAL_ORDER, TUTORIAL_VIDEOS } from "@/lib/tutorial-videos";

export default function TutorialsPage() {
  return (
    <>
      <Header title="Tutorials" />
      <div className="page-container">
        <p className="text-body text-gray-500 mb-6 max-w-2xl">
          Short walkthroughs of the workflows people ask about most. Each one is
          under four minutes, subtitled, and paired with a written version below
          the player — you don&apos;t need sound.
        </p>

        <div className="space-y-6 max-w-3xl">
          {TUTORIAL_ORDER.map((key) => {
            const video = TUTORIAL_VIDEOS[key];
            return (
              <Card key={key}>
                <h2 className="text-h2 text-header mb-3">{video.title}</h2>
                <TutorialVideo tutorialKey={key} variant="inline" />
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
