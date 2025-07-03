import React from 'react';

import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux'
import { Enums, setVolumeConfig, setNiftiConfig } from '@/features/presentationSlice';
import { setTitle, setLoading, setOption } from '@/features/optionSlice';
import toast from 'react-hot-toast';
import { useHotkeys } from 'react-hotkeys-hook';

import {
  Enums as NiftiEnums,
  createNiftiImageIdsAndCacheMetadata,
} from '@cornerstonejs/nifti-volume-loader';
import { volumeLoader } from '@cornerstonejs/core';
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from '@cornerstonejs/tools';
import { toAbsoluteURL } from '@/utilities';
import { getNiftiDetails, setNiftiStatus } from '@/visualreview';

import Header from '@/components/Header';

import LoadingSpinner from '@/components/LoadingSpinner';
import { VolumeView } from '@/features/volume-view';
import { ToolsPanel } from '@/features/tools';
import OperationsPanel from '@/components/OperationsPanel';
import NavigationPanel from '@/components/NavigationPanel';
import { DetailsPanel } from '@/features/details';

import { Context } from '@/components/Context.js';
import RouteLayout from '@/components/RouteLayout';

import './NiftiReviewFile.css';

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation
} = cornerstoneTools;

function transformDetails(details) {

  return {
    'File ID': details.file_id,
    'Import File Name': details.import_name,
    'Import File Path': details.import_path,
    'Posda File Path': details.posda_path,
    'download_path': details.download_path,
    'download_name': details.import_name,
  }
}

export default function NiftiReviewFile({ file, vr, onNext, onPrevious }) {

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  const toggleRightPanel = () => setShowRightPanel(v => !v);

  const [renderingEngine, setRenderingEngine] = useState(cornerstone.getRenderingEngine("re1"));

  const dispatch = useDispatch();

  const [volumeId, setVolumeId] = useState();
  const [segmentationId, setSegmentationId] = useState();
  const [imageIds, setImageIds] = useState()

  const [toolGroup, setToolGroup] = useState(null);
  const [toolGroup3d, setToolGroup3d] = useState();
  const [preset3d, setPreset3d] = useState("MR-Default");

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);
  const [errorMessage, setErrorMessage] = useState();

  const [volumetric, setVolumetric] = useState(true);
  const [details, setDetails] = useState(true);

  let viewer;

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [showLeftPanel, showRightPanel]);

  useEffect(() => {
    // Only create a new rendering engine if one doesn't already exist
    if (renderingEngine === undefined) {
      setRenderingEngine(new cornerstone.RenderingEngine("re1"));
    }

    let toolGroup = ToolGroupManager.createToolGroup("toolGroup2d");
    let toolGroup3d = ToolGroupManager.createToolGroup("toolGroup3d");

    setRenderingEngine(renderingEngine);
    setToolGroup(toolGroup);
    setToolGroup3d(toolGroup3d);

    // TODO: this is for debug use only
    window.ToolGroupManager = ToolGroupManager;
    window.renderingEngine = renderingEngine;
    window.toolGroup2d = toolGroup;

    // Teardown function
    return () => {
      ToolGroupManager.destroyToolGroup("toolGroup2d")
      ToolGroupManager.destroyToolGroup("toolGroup3d")
      // Do not delete the RenderingEngine here, it needs
      // to stay, for now
    };
  }, []);

  useEffect(() => {
    console.log("NiftiReviewFile useEffect[file]:", file);

    const initializeVolume = async () => {
      setIsErrored(false);
      let volumeId = `vol-${file}`;
      let segmentationId = `vol-${file}-seg`;

      try {
        const details = await getNiftiDetails(file);
        setDetails(details);

        if (details.download_path === undefined) {
          setError(true);
          return;
        }

        let rel_url = details.download_path;
        if (details.is_zipped) {
          rel_url += ".gz";
        }
        const url = toAbsoluteURL(rel_url);
        const imageIds = await createNiftiImageIdsAndCacheMetadata({ url });
        let volume = cornerstone.cache.getVolume(volumeId);
        if (!volume) {
          volume = await volumeLoader.createAndCacheVolume(volumeId, {
            imageIds,
          });
        }
        try {
          await volume.load();
        } catch (error) {
          console.log(error);
          return;
        }

        cornerstone.cache.getVolumes().forEach((v) => {
          if (v.volumeId !== volumeId) {
            cornerstone.cache.removeVolumeLoadObject(v.volumeId);
          }

        });

      } catch (error) {
        console.log(error);
        // TODO: set an isError status here and display an error message?
        setErrorMessage(error);
        setIsErrored(true);
        return;
      }

      setIsInitialized(true);
      setVolumeId(volumeId);
      setSegmentationId(segmentationId);

      dispatch(setTitle("Nifti File Review"));
      dispatch(setVolumeConfig());
      dispatch(setNiftiConfig());

      dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
      dispatch(setOption({ key: "leftClick", value: Enums.LeftClickOptions.WINDOW_LEVEL }));
      dispatch(setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }));

      dispatch(setLoading(false));
    };

    initializeVolume();

  }, [file]);

  useHotkeys('g', () => handleOperationsAction('good'));
  useHotkeys('b', () => handleOperationsAction('bad'));
  useHotkeys('l', () => handleOperationsAction('blank'));
  useHotkeys('s', () => handleOperationsAction('scout'));
  useHotkeys('o', () => handleOperationsAction('other'));

  async function handleOperationsAction(action) {
    switch (action) {
      case "good":
        await setNiftiStatus(file, "Good");
        toast.success("Status set to Good!");
        break;
      case "bad":
        await setNiftiStatus(file, "Bad");
        toast.success("Status set to Bad!");
        break;
      case "blank":
        await setNiftiStatus(file, "Blank");
        toast.success("Status set to Blank!");
        break;
      case "scout":
        await setNiftiStatus(file, "Scout");
        toast.success("Status set to Scout!");
        break;
      case "other":
        await setNiftiStatus(file, "Other");
        toast.success("Status set to Other!");
        break;
      default:
        console.log("Unknown action:", action);
    }
  }

  // short-circuit if not loaded yet
  if (isErrored) {
    return (
      <>
        <div>There was an error loading this File :(</div>
        <p>{errorMessage.message}</p>
      </>
    );
  }
  if (!isInitialized) {
    return <LoadingSpinner />
  }

  console.log(">>>>> about to pass volumeId=", volumeId);
  viewer =
    <VolumeView
      volumeId={volumeId}
      segmentationId={segmentationId}
      preset3d={preset3d}
      toolGroup={toolGroup}
      toolGroup3d={toolGroup3d}
      onToggleLeftPanel={toggleLeftPanel}
      onToggleRightPanel={toggleRightPanel}
    />


  return (
    <RouteLayout
      leftPanel={
        // showLeftPanel ?
        <>
          {vr &&
            <NavigationPanel
              onNext={onNext}
              onPrevious={onPrevious}
              currentId={file}
              idLabel='File'
            />
          }
          <ToolsPanel
            toolGroup={toolGroup}
            toolGroup3d={toolGroup3d}
            preset3d={preset3d}
            onPresetChange={setPreset3d}
          />
        </>
        // : null
      }
      middlePanel={
        <>
          {viewer}
          <OperationsPanel
            onAction={handleOperationsAction}
          />
        </>
      }
      rightPanel={
        // showRightPanel ?
        <DetailsPanel details={transformDetails(details)} />
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
