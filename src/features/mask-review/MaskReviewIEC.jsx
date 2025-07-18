import React from 'react';

import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux'

import {
  Enums,
  setStackConfig,
  setVolumeConfig,
  toggleLeftPanel,
  toggleRightPanel,
} from '@/features/presentationSlice';

import { setTitle, setLoading, setOption } from '@/features/optionSlice';
import { useHotkeys } from 'react-hotkeys-hook';
import toast from 'react-hot-toast';

import createImageIdsAndCacheMetaData from "@/lib/createImageIdsAndCacheMetaData";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  expandSegTo3D,
  isSegFlat,
  loadVolumeAndSegmentation,
  getIECInfo,
} from '@/utilities';
import { getDicomDetails } from '@/visualreview';


import LoadingSpinner from '@/components/LoadingSpinner';
import { VolumeView } from '@/features/volume-view';
import { StackView } from '@/features/stack-view';
import { ToolsPanel } from '@/features/tools';
import OperationsPanel from '@/components/OperationsPanel';
import NavigationPanel from '@/components/NavigationPanel';
import { DetailsPanel } from '@/features/details';

import RouteLayout from '@/components/RouteLayout';
import ErrorPanel from '@/components/ErrorPanel';

import './MaskReviewIEC.css';

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation
} = cornerstoneTools;

function transformDetails(details) {

  return {
    'IEC': details.image_equivalence_class_id,
    'Images in IEC': details.file_count,
    'Processing Status': details.processing_status,
    'Review Status': details.review_status,
    'Modality': details.modality,
    'Patient ID': details.patient_id,
    'Series Instance UID': details.series_instance_uid,
    'Series Description': details.series_description,
    'Body Part Examined': details.body_part_examined,
    'Path': details.path,
    'download_path': `/papi/v1/masking/${details.image_equivalence_class_id}/reviewfiles/download`,
    'download_name': `mask_review_${details.image_equivalence_class_id}.zip`,
  }
}

export default function MaskReviewIEC({ iec, vr, onNext, onPrevious }) {

  // const [showLeftPanel, setShowLeftPanel] = useState(true);
  // const [showRightPanel, setShowRightPanel] = useState(true);
  // const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  // const toggleRightPanel = () => setShowRightPanel(v => !v);

  const dispatch = useDispatch();

  const showLeftPanel = useSelector(s => s.presentation.panelConfig.open.left);
  const showRightPanel = useSelector(s => s.presentation.panelConfig.open.right);
  console.log("showLeftPanel:", showLeftPanel, "showRightPanel:", showRightPanel);
  const handleToggleLeft = () => dispatch(toggleLeftPanel());
  const handleToggleRight = () => dispatch(toggleRightPanel());

  const [renderingEngine, setRenderingEngine] = useState(cornerstone.getRenderingEngine("re1"));

  const [volumeId, setVolumeId] = useState()
  const [imageIds, setImageIds] = useState()

  const [toolGroup, setToolGroup] = useState();
  const [toolGroup3d, setToolGroup3d] = useState();
  const [preset3d, setPreset3d] = useState("CT-MIP");

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);
  const [errorMessage, setErrorMessage] = useState();

  const [volumetric, setVolumetric] = useState(true);
  const [details, setDetails] = useState(true);
  const [expanded, setExpanded] = useState(false);

  let viewer;

  let coords; // coordinates of drawn mask

  /**
   * Setup the RenderingEngine and ToolGroup
   */

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

  // Load the volume into the cache
  useEffect(() => {
    console.log("MaskReviewIEC useEffect[iec]:", iec);

    const initialize = async () => {
      const details = await getDicomDetails(iec);
      const { volumetric } = details;
      setDetails(details);
      setVolumetric(volumetric); // still update state

      setIsErrored(false);
      let volumeId = `mask-review-${iec}`;
      //let segmentationId = `mask-review-${iec}-seg`;

      const { frames } = await getIECInfo(iec, true);
      setImageIds(frames);

      setVolumeId(volumeId);
      //setSegmentationId(segmentationId);

      try {
        // for testing error handling
        if (volumetric) {
          const volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, {
            imageIds: frames,
          });
          volume.load();
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
          dispatch(setTitle("Mask Volume Review"));
          dispatch(setVolumeConfig());
        } else {
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
          dispatch(setTitle("Mask Stack Review"));
          dispatch(setStackConfig());
        }
        dispatch(setOption({ key: "leftClick", value: Enums.LeftClickOptions.WINDOW_LEVEL }));
        dispatch(setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }));
        // throw new Error("This is a test error");
      } catch (error) {
        console.log(error);
        // TODO: set an isError status here and display an error message?
        setErrorMessage(error);
        setIsErrored(true);
        // return;
      }

      setIsInitialized(true);
      dispatch(setLoading(false));
    };

    initialize();

  }, [iec]);

  useHotkeys('a', () => handleAction('accept mask'));
  useHotkeys('r', () => handleAction('reject mask'));
  useHotkeys('s', () => handleAction('skip mask'));
  useHotkeys('n', () => handleAction('nonmaskable mask'));

  function handleAcceptMask() {
    toast.success("Mask accepted!");
  }
  function handleRejectMask() {
    toast.success("Mask rejected!");
  }
  function handleSkipMask() {
    toast.success("Mask skipped!");
  }
  function handleNonMaskable() {
    toast.success("Image is not maskable!");
  }
  function handleAction(action) {
    switch (action) {
      case 'accept mask':
        handleAcceptMask();
        break;
      case 'reject mask':
        handleRejectMask();
        break;
      case 'skip mask':
        handleSkipMask();
        break;
      case 'nonmaskable mask':
        handleNonMaskable();
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  // short-circuit if not loaded yet

  if (!isInitialized) {
    return <LoadingSpinner />
  }

  if (volumetric) {
    console.log(">>>>> about to pass volumeId=", volumeId);
    viewer =
      <VolumeView
        volumeId={volumeId}
        preset3d={preset3d}
        toolGroup={toolGroup}
        toolGroup3d={toolGroup3d}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
  } else {
    viewer = <StackView
      toolGroup={toolGroup}
      frames={imageIds}
      onToggleLeftPanel={handleToggleLeft}
      onToggleRightPanel={handleToggleRight}
    />
  }

  if (isErrored) {
    viewer = <ErrorPanel error={errorMessage.message} />
  }

  return (
    <RouteLayout
      leftPanel={
        // showLeftPanel ?
        <>
          {vr &&
            <NavigationPanel
              onNext={onNext}
              onPrevious={onPrevious}
              currentId={iec}
              idLabel='IEC'
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
          <OperationsPanel onAction={handleAction} />
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
  )
}
