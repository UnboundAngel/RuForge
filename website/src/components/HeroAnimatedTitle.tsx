import { AnimatedText } from './ui/animated-underline-text-one';

interface HeroAnimatedTitleProps {
  title?: string;
}

export default function HeroAnimatedTitle({ title = 'RuForge' }: HeroAnimatedTitleProps) {
  return (
    <AnimatedText
      className="w-full mb-6"
      textClassName="font-hand text-7xl font-bold tracking-tight text-rf-text leading-[1.1]"
      underlineClassName="text-rf-accent"
      underlinePath="M 0,10 Q 75,0 150,10 Q 225,20 300,10"
      underlineHoverPath="M 0,10 Q 75,20 150,10 Q 225,0 300,10"
      underlineDuration={1.5}
    >
      {title}
    </AnimatedText>
  );
}
