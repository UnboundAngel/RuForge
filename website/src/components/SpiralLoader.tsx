import { useState, useRef, useCallback, useEffect } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

const FAST_REPEATS = 4;
const SLOW_REPEATS = 2;

const spiralFastData = {"nm":"spiral2","h":16,"w":16,"meta":{"g":"@lottiefiles/toolkit-js 0.71.7"},"layers":[{"ty":4,"nm":"Vector 5821 copy Outlines","sr":1,"st":0,"op":30,"ip":0,"ln":"18","hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[12.5,6.5,0]},"s":{"a":0,"k":[100,100,100]},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[12,8,0],"t":0},{"s":[4,8,0],"t":29}]},"r":{"a":0,"k":0},"sa":{"a":0,"k":0},"o":{"a":0,"k":24}},"shapes":[{"ty":"gr","nm":"Group 1","it":[{"ty":"sh","nm":"Path 1","d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[-0.289,3.296],[2.218,0],[-0.23,-2.627],[-4.452,0],[-0.289,3.296],[2.218,0],[-0.23,-2.627],[-4.452,0],[-0.289,3.296],[2.218,0],[-0.232,-2.627],[-4.443,0]],"o":[[4.452,0],[0.23,-2.627],[-2.218,0],[0.289,3.296],[4.452,0],[0.23,-2.627],[-2.218,0],[0.289,3.296],[4.452,0],[0.23,-2.627],[-2.218,0],[0.292,3.296],[0,0]],"v":[[-12,6],[-4.975,-1.012],[-8,-6],[-11.025,-1.012],[-4,6],[3.025,-1.012],[0,-6],[-3.025,-1.012],[4,6],[11.025,-1.012],[8,-6],[4.98,-1.012],[12,6]]}}},{"ty":"st","nm":"Stroke 1","lc":2,"lj":2,"ml":4,"o":{"a":0,"k":100},"w":{"a":0,"k":1.4},"c":{"a":0,"k":[1,1,1]}},{"ty":"tr","a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"p":{"a":0,"k":[12.5,6.5]},"r":{"a":0,"k":0},"sa":{"a":0,"k":0},"o":{"a":0,"k":100}}]},{"ty":"tm","nm":"Trim Paths 1","e":{"a":1,"k":[{"o":{"x":0.341,"y":0.488},"i":{"x":0.269,"y":0.75},"s":[44],"t":0},{"s":[77],"t":29}]},"o":{"a":0,"k":0},"s":{"a":1,"k":[{"o":{"x":0.32,"y":0.154},"i":{"x":0.826,"y":0.579},"s":[23],"t":0},{"s":[57],"t":29}]},"m":1}],"ind":1}],"v":"5.7.0","fr":60,"op":30,"ip":0,"assets":[]};

const spiralSlowData = {"nm":"spiral1","h":16,"w":16,"meta":{"g":"@lottiefiles/toolkit-js 0.71.7"},"layers":[{"ty":4,"nm":"Vector 5821 copy Outlines","sr":1,"st":0,"op":60,"ip":0,"ln":"18","hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[12.5,6.5,0]},"s":{"a":0,"k":[100,100,100]},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[12,8,0],"t":0},{"s":[4,8,0],"t":59}]},"r":{"a":0,"k":0},"sa":{"a":0,"k":0},"o":{"a":0,"k":24}},"shapes":[{"ty":"gr","nm":"Group 1","it":[{"ty":"sh","nm":"Path 1","d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[-0.289,3.296],[2.218,0],[-0.23,-2.627],[-4.452,0],[-0.289,3.296],[2.218,0],[-0.23,-2.627],[-4.452,0],[-0.289,3.296],[2.218,0],[-0.232,-2.627],[-4.443,0]],"o":[[4.452,0],[0.23,-2.627],[-2.218,0],[0.289,3.296],[4.452,0],[0.23,-2.627],[-2.218,0],[0.289,3.296],[4.452,0],[0.23,-2.627],[-2.218,0],[0.292,3.296],[0,0]],"v":[[-12,6],[-4.975,-1.012],[-8,-6],[-11.025,-1.012],[-4,6],[3.025,-1.012],[0,-6],[-3.025,-1.012],[4,6],[11.025,-1.012],[8,-6],[4.98,-1.012],[12,6]]}}},{"ty":"st","nm":"Stroke 1","lc":2,"lj":2,"ml":4,"o":{"a":0,"k":100},"w":{"a":0,"k":1.4},"c":{"a":0,"k":[1,1,1]}},{"ty":"tr","a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"p":{"a":0,"k":[12.5,6.5]},"r":{"a":0,"k":0},"sa":{"a":0,"k":0},"o":{"a":0,"k":100}}]},{"ty":"tm","nm":"Trim Paths 1","e":{"a":1,"k":[{"o":{"x":0.341,"y":0.992},"i":{"x":0.269,"y":0.491},"s":[44],"t":0},{"s":[77],"t":59}]},"o":{"a":0,"k":0},"s":{"a":1,"k":[{"o":{"x":0.32,"y":0.313},"i":{"x":0.826,"y":0.143},"s":[23],"t":0},{"s":[57],"t":59}]},"m":1}],"ind":1}],"v":"5.7.0","fr":60,"op":60,"ip":0,"assets":[]};

export function SpiralLoader({ size = 18 }: { size?: number }) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'fast' | 'slow'>('fast');
  const repeatCount = useRef(0);
  const fastRef = useRef<LottieRefCurrentProps | null>(null);
  const slowRef = useRef<LottieRefCurrentProps | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const startFast = useCallback(() => {
    repeatCount.current = 0;
    setPhase('fast');
    slowRef.current?.stop();
    fastRef.current?.goToAndPlay(0, true);
  }, []);

  const startSlow = useCallback(() => {
    repeatCount.current = 0;
    setPhase('slow');
    fastRef.current?.stop();
    slowRef.current?.goToAndPlay(0, true);
  }, []);

  const onFastDone = useCallback(() => {
    repeatCount.current += 1;
    if (repeatCount.current < FAST_REPEATS) fastRef.current?.goToAndPlay(0, true);
    else startSlow();
  }, [startSlow]);

  const onSlowDone = useCallback(() => {
    repeatCount.current += 1;
    if (repeatCount.current < SLOW_REPEATS) slowRef.current?.goToAndPlay(0, true);
    else startFast();
  }, [startFast]);

  if (!mounted) return null;

  return (
    <span
      className="docs-spiral-loader"
      style={{ width: size, height: size, display: 'inline-block', position: 'relative', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', inset: 0, opacity: phase === 'fast' ? 1 : 0, transition: 'opacity 75ms' }}>
        <Lottie
          lottieRef={fastRef}
          animationData={spiralFastData}
          loop={false}
          autoplay={true}
          onComplete={onFastDone}
          style={{ width: '100%', height: '100%' }}
        />
      </span>
      <span style={{ position: 'absolute', inset: 0, opacity: phase === 'slow' ? 1 : 0, transition: 'opacity 75ms' }}>
        <Lottie
          lottieRef={slowRef}
          animationData={spiralSlowData}
          loop={false}
          autoplay={false}
          onComplete={onSlowDone}
          style={{ width: '100%', height: '100%' }}
        />
      </span>
    </span>
  );
}
