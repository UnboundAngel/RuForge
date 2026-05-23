import { AnimatedText } from './ui/animated-underline-text-one';

interface HeroAnimatedTitleProps {
  lineOne: string;
  lineTwo: string;
}

export default function HeroAnimatedTitle({ lineOne, lineTwo }: HeroAnimatedTitleProps) {
  return (
    <AnimatedText
      className="w-full mb-4 md:mb-6"
      textClassName="font-hand text-4xl font-bold tracking-tight text-rf-text sm:text-5xl lg:text-6xl leading-[1.1]"
      underlineClassName="text-rf-accent"
      underlinePath="M 0,10 Q 75,0 150,10 Q 225,20 300,10"
      underlineHoverPath="M 0,10 Q 75,20 150,10 Q 225,0 300,10"
      underlineDuration={1.5}
    >
      {lineOne}
      <br className="hidden sm:inline" />
      {lineTwo}
    </AnimatedText>
  );
}
