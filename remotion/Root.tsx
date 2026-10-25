import React from "react";
import { Composition } from "remotion";
import { ReceiptShort } from "./ReceiptShort";
import type { ReceiptProps } from "./props";
import { H, W } from "./layout";
import sample from "./sample-props.json";

export const Root: React.FC = () => (
  <Composition
    id="ReceiptShort"
    component={ReceiptShort}
    width={W}
    height={H}
    fps={30}
    durationInFrames={900}
    defaultProps={sample as unknown as ReceiptProps}
    calculateMetadata={({ props }) => ({ durationInFrames: props.timeline.total })}
  />
);
