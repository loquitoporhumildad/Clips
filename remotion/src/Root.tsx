import React from 'react';
import {CalculateMetadataFunction, Composition} from 'remotion';
import {DataShort} from './DataShort';
import {Props} from './types';
import sample from '../../content/2026-11-14/gta-countdown-5.json';

const calc: CalculateMetadataFunction<Props> = ({props}) => ({
  durationInFrames: Math.max(30, Math.round(props.spec.scenes.reduce((a, s) => a + s.seconds, 0) * 30)),
});

export const Root: React.FC = () => (
  <Composition
    id="DataShort"
    component={DataShort}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={300}
    defaultProps={{spec: sample as Props['spec'], lang: 'en'}}
    calculateMetadata={calc}
  />
);
