import React from 'react';
import VolumeViewport3d from "@/components/VolumeViewport3d";

export default function MaybeVolumeViewport3d(
    { viewportId, volumeId, renderingEngine, toolGroup, segmentationId, orientation, preset3d, modality }
) {

    const [loaded, setLoaded] = React.useState(false);

    if (loaded) {
        return <VolumeViewport3d
            key={viewportId}
            viewportId={viewportId}
            volumeId={volumeId}
            renderingEngine={renderingEngine}
            toolGroup={toolGroup}
            segmentationId={segmentationId}
            orientation={orientation}
            preset3d={preset3d}
            modality={modality}
        />;
    }

    return (
        <>
            <button onClick={() => {setLoaded(true)}}>Bring me to life!</button>
        </>
    );
}