// Tweaks panel — exposes FOV, render distance, enemy speed/count, pixelation.
const { useState, useEffect } = React;

function DaniTweaks() {
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "fov": 1.05,
    "maxDepth": 22,
    "pixelation": 2,
    "enemySpeed": 1.3,
    "enemyCount": 8,
    "music": true,
    "volume": 0.35
  }/*EDITMODE-END*/);

  // push into game on every change
  useEffect(() => {
    if (window.GAME_APPLY_TWEAKS) window.GAME_APPLY_TWEAKS(tweaks);
    if (window.AUDIO) {
      if (tweaks.music) {
        window.AUDIO.startMusic();
      } else {
        window.AUDIO.stopMusic();
      }
    }
  }, [tweaks]);

  return (
    <TweaksPanel title="TWEAKS">
      <TweakSection title="View">
        <TweakSlider
          label="FOV"
          value={tweaks.fov}
          min={0.6} max={1.6} step={0.05}
          onChange={v => setTweak('fov', v)}
          format={v => `${Math.round(v * 180 / Math.PI)}°`}
        />
        <TweakSlider
          label="Render distance"
          value={tweaks.maxDepth}
          min={8} max={40} step={1}
          onChange={v => setTweak('maxDepth', v)}
        />
        <TweakSlider
          label="Pixelation"
          value={tweaks.pixelation}
          min={1} max={6} step={1}
          onChange={v => setTweak('pixelation', v)}
          format={v => v === 1 ? 'crisp' : `${v}×`}
        />
      </TweakSection>
      <TweakSection title="Cavemen">
        <TweakSlider
          label="Speed"
          value={tweaks.enemySpeed}
          min={0.4} max={3.5} step={0.1}
          onChange={v => setTweak('enemySpeed', v)}
        />
        <TweakSlider
          label="Count"
          value={tweaks.enemyCount}
          min={1} max={12} step={1}
          onChange={v => setTweak('enemyCount', v)}
        />
      </TweakSection>
      <TweakSection title="Audio">
        <TweakSlider
          label="Volume"
          value={tweaks.volume}
          min={0} max={1} step={0.05}
          onChange={v => { setTweak('volume', v); if (window.AUDIO) window.AUDIO.setVolume(v); }}
          format={v => `${Math.round(v * 100)}%`}
        />
        <TweakToggle
          label="Lobby music"
          value={tweaks.music}
          onChange={v => setTweak('music', v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

const tweaksRoot = document.createElement('div');
document.body.appendChild(tweaksRoot);
ReactDOM.createRoot(tweaksRoot).render(<DaniTweaks />);
