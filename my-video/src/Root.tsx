import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { CncEdit } from "./CncEdit";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition
        id="CncEdit"
        component={CncEdit}
        durationInFrames={591}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
