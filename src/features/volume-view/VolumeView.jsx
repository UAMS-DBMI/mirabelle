import React, { useState, useEffect } from "react";

import { RenderingEngine } from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import toast from "react-hot-toast";

import VolumeViewport from "@/components/VolumeViewport";
import VolumeViewport3d from "@/components/VolumeViewport3d";
import { ToolsPanel } from "@/features/tools";
import useRendererResize from "@/hooks/useRendererResize";

import OperationsPanel from "@/components/OperationsPanel";

import "./VolumeView.css";

const {
  ToolGroupManager,
  TrackballRotateTool,
  BrushTool,
  RectangleScissorsTool,
  StackScrollTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

export default function VolumeView({
  volumeId,
  segmentationId,
  defaultPreset3d,
  toolGroup,
  toolGroup3d,
}) {
  const [voiSynchronizer, setVoiSynchronizer] = useState();
  const [renderingEngine, setRenderingEngine] = useState();
  const [preset3d, setPreset3d] = useState(defaultPreset3d);

  const [mip, setMip] = useState(false);

  useRendererResize(renderingEngine);

  useEffect(() => {
    cornerstoneTools.addTool(TrackballRotateTool);
    cornerstoneTools.addTool(BrushTool);
    cornerstoneTools.addTool(RectangleScissorsTool);
    cornerstoneTools.addTool(StackScrollTool);

    if (!voiSynchronizer) {
      let voiSync = cornerstoneTools.SynchronizerManager.getSynchronizer(
        "vol_voi_syncronizer",
      );
      if (!voiSync) {
        voiSync = cornerstoneTools.synchronizers.createVOISynchronizer(
          "vol_voi_syncronizer",
        );
      }
      setVoiSynchronizer(voiSync);
    }

    // Only create a new rendering engine if one doesn't already exist
    let renderingEngine = cornerstone.getRenderingEngine("re1");
    if (renderingEngine === undefined) {
      renderingEngine = new RenderingEngine("re1");
    }

    toolGroup3d.addTool(TrackballRotateTool.toolName);

    toolGroup3d.setToolActive(TrackballRotateTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });

    // TODO: this is for debug use only
    window.ToolGroupManager = ToolGroupManager;
    window.renderingEngine = renderingEngine;
    window.toolGroup2d = toolGroup;

    setRenderingEngine(renderingEngine);

    // Teardown function
    return () => { };
  }, []);

  useEffect(() => {
    const renderingEngine = cornerstone.getRenderingEngine("re1");
    if (!renderingEngine) return;

    const viewport = renderingEngine.getViewport("coronal3d");
    if (viewport) {
      viewport.setProperties({ preset: defaultPreset3d });
      viewport.render();
    }
  }, [defaultPreset3d]);

  if (renderingEngine == null) {
    return <div>Loading...</div>;
  }

  return (
    <div id="volume-view" className="viewer">
      <VolumeViewport3d
        viewportId="coronal3d"
        volumeId={volumeId}
        renderingEngine={renderingEngine}
        toolGroup={toolGroup3d}
        segmentationId={segmentationId}
        orientation="CORONAL"
        preset3d={preset3d}
      />
      <VolumeViewport
        viewportId="axial2d"
        volumeId={volumeId}
        renderingEngine={renderingEngine}
        voiSynchronizer={voiSynchronizer}
        toolGroup={toolGroup}
        segmentationId={segmentationId}
        orientation="AXIAL"
      />
      <VolumeViewport
        viewportId="coronal2d"
        volumeId={volumeId}
        renderingEngine={renderingEngine}
        voiSynchronizer={voiSynchronizer}
        toolGroup={toolGroup}
        segmentationId={segmentationId}
        orientation="CORONAL"
      />
      <VolumeViewport
        viewportId="sagittal2d"
        volumeId={volumeId}
        renderingEngine={renderingEngine}
        voiSynchronizer={voiSynchronizer}
        toolGroup={toolGroup}
        segmentationId={segmentationId}
        orientation="SAGITTAL"
      />
    </div>
  );
}
