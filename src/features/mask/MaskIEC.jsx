import React from 'react';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux'
import { useHotkeys } from 'react-hotkeys-hook';

import {
  Enums,
  setMaskerConfig,
  setStackConfig,
  setVolumeConfig,
  toggleLeftPanel,
  toggleRightPanel,
  reset,
} from '@/features/presentationSlice';

import { setTitle, setLoading, setOption } from '@/features/optionSlice';
import toast from 'react-hot-toast';

import createImageIdsAndCacheMetaData from "@/lib/createImageIdsAndCacheMetaData";
import { volumeLoader } from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  expandSegTo3D,
  expandSegTo3DInWorldSpace,
  getCoordsForStackSeg,
  isSegFlat,
  loadIECVolumeAndSegmentation,
  loadVolumeAndSegmentation,
  getIECInfo,
  getImageIdsFromIEC,
  loadStackSegmentation,
} from '@/utilities';
import { getDicomDetails } from '@/visualreview';
import { submitFinalCoords } from '@/masking';

import LoadingSpinner from '@/components/LoadingSpinner';
import { VolumeView } from '@/features/volume-view';
import { StackView } from '@/features/stack-view';
import { ToolsPanel } from '@/features/tools';
import OperationsPanel from '@/components/OperationsPanel';
import NavigationPanel from '@/components/NavigationPanel';
import { DetailsPanel } from '@/features/details';

import RouteLayout from '@/components/RouteLayout';
import ErrorPanel from '@/components/ErrorPanel';

import './MaskIEC.css';

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
    'download_path': details.download_path,
    'download_name': details.download_name,
  }
}

export default function MaskIEC({ iec, vr, onNext, onPrevious }) {

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

  const optionsForm = useSelector(state => state.options.form);
  const optionsFunction = useSelector(state => state.options.function);
  const optionsNoise = useSelector(state => state.options.noise);
  const optionsFill = useSelector(state => state.options.fill);
  const [renderingEngine, setRenderingEngine] = useState(cornerstone.getRenderingEngine("re1"));

  const [volumeId, setVolumeId] = useState()
  const [segmentationId, setSegmentationId] = useState();
  const [imageIds, setImageIds] = useState()

  const [toolGroup, setToolGroup] = useState();
  const [toolGroup3d, setToolGroup3d] = useState();
  const preset3d = useSelector(state => state.options.preset);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);
  const [errorMessage, setErrorMessage] = useState();

  const [volumetric, setVolumetric] = useState(true);
  const [details, setDetails] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [coords, setCoords] = useState();

  let viewer;

  // console.log("MaskIEC renderingEngine:", renderingEngine);

  useHotkeys('e', handleExpand);
  useHotkeys('c', handleClear);
  useHotkeys('a', handleAccept);
  useHotkeys('s', handleSkip);
  useHotkeys('n', handleNonMaskable);

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [showLeftPanel, showRightPanel]);

  useEffect(() => {
    // Only create a new rendering engine if one doesn't already exist
    if (renderingEngine === undefined) {
      console.log("Creating new rendering engine");
      setRenderingEngine(new cornerstone.RenderingEngine("re1"));
    }

    let toolGroup = ToolGroupManager.createToolGroup("toolGroup2d");
    let toolGroup3d = ToolGroupManager.createToolGroup("toolGroup3d");

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

  useLayoutEffect(() => {
    console.log("MaskIEC useEffect[iec]:", iec);

    const initialize = async () => {
      const details = await getDicomDetails(iec);
      const { volumetric } = details;
      setDetails(details);

      setIsErrored(false);
      let volumeId = `mask-${iec}`;
      // append a random number 
      let segmentationId = `mask-${iec}-seg-${Math.floor(Math.random() * 10000)}`;

      const { frames } = await getIECInfo(iec);
      const imageIds = frames;

      setImageIds(imageIds);

      setVolumeId(volumeId);
      setVolumetric(volumetric); // still update state
      setSegmentationId(segmentationId);

      try {
        if (volumetric) {
          await loadVolumeAndSegmentation(imageIds, volumeId, segmentationId);
          dispatch(setTitle("Mask Volume"));
          dispatch(reset());
          dispatch(setMaskerConfig());
          dispatch(setVolumeConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
          dispatch(setOption({ key: "function", value: Enums.FunctionOptions.MASK }));
          dispatch(setOption({ key: "form", value: Enums.FormOptions.CYLINDER }));
        } else {
          await loadStackSegmentation(imageIds, segmentationId);
          dispatch(setTitle("Mask Stack"));
          dispatch(reset());
          dispatch(setMaskerConfig());
          dispatch(setStackConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
          dispatch(setOption({ key: "function", value: Enums.FunctionOptions.BLACKOUT }));
          dispatch(setOption({ key: "form", value: Enums.FormOptions.CUBOID }));
        }
        dispatch(setOption({ key: "leftClick", value: Enums.LeftClickOptions.SELECTION }));
        dispatch(setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }));
      } catch (error) {
        console.log(error);
        // TODO: set an isError status here and display an error message?
        setErrorMessage(error);
        setIsErrored(true);
        return;
      }

      setIsInitialized(true);
      dispatch(setLoading(false));
    };

    initialize();

    return () => {
      // Make sure we disable drawing of the volume
      // when we leave, so the next one doesn't attempt to draw
      // before it exists
      setIsInitialized(false);
    };
  }, [iec]);

  async function handleOperationsAction(action) {
    switch (action) {
      case "expand":
        await handleExpand();
        break;
      case "clear":
        handleClear();
        break;
      case "accept":
        await handleAccept();
        break;
      case "skip":
        await handleSkip();
        break;
      case "nonMaskable":
        await handleNonMaskable();
        break;
      default:
        console.log("Unknown action:", action);
    }
  }
  async function handleExpand() {
    if (!expanded && isSegFlat(segmentationId)) {
      alert("Cannot expand a flat selection! You must draw in at least two planes.");
      return;
    }
    const coords = expandSegTo3D(segmentationId);


    //flag data as updated so it will redraw
    cornerstoneTools.segmentation
      .triggerSegmentationEvents
      .triggerSegmentationDataModified(segmentationId);


    // TODO I don't like this being here, perhaps put it inside VolumeView
    // and expose a callback that can be called from here? 
    const renderingEngine = cornerstone.getRenderingEngines()[0];
    const viewports = renderingEngine.getViewports();
    viewports.forEach(async (item) => {
      let viewportId = item.id;
      if (viewportId.startsWith("coronal3d")) {
        await segmentation.addSegmentationRepresentations(
          viewportId, [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Surface,
          }
        ],
        );
      }
    });

    setExpanded(true);
    setCoords(coords);
    toast.success("Expanded selection!");
  }
  function handleClear() {
    const segmentationVolume = cornerstone.cache.getVolume(segmentationId);
    const { dimensions, voxelManager } = segmentationVolume;

    let scalarData = voxelManager.getCompleteScalarDataArray();
    scalarData.fill(0);
    voxelManager.setCompleteScalarDataArray(scalarData);
    voxelManager.setBounds([[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]]);

    //flag data as updated so it will redraw
    cornerstoneTools.segmentation
      .triggerSegmentationEvents
      .triggerSegmentationDataModified(segmentationId);
  }
  async function handleAccept() {
    if (volumetric && !expanded) {
      alert("You must Expand Selection first!");
      return;
    }

    let finalCoords = coords;
    let selectedForm = optionsForm;
    let selectedFunction = optionsFunction;
    let selectedNoise = optionsNoise;
    let selectedFill = optionsFill;

    let spacing = null

    if (volumetric) {
      const volume = cornerstone.cache.getVolume(volumeId);
      spacing = volume.spacing;
    }
    else {
      const imageIds = segmentation.getLabelmapImageIds(segmentationId);
      if (!coords) {
        finalCoords = getCoordsForStackSeg(imageIds);
        setCoords(finalCoords);
      }
      const image = cornerstone.cache.getImage(imageIds[0]);
      spacing = [
        image.columnPixelSpacing ?? 1,
        image.rowPixelSpacing ?? 1,
        1
      ];
    }

    console.log(finalCoords, spacing, iec);
    await submitFinalCoords(finalCoords, spacing, iec, selectedForm, selectedFunction, selectedNoise, selectedFill);

    toast.success("Submitted for masking!");
  }

  function handleSkip() {
    return
  }

  function handleNonMaskable() {
    return
  }

  // short-circuit if not loaded yet
  if (isErrored) {
    return (
      <ErrorPanel error={errorMessage.message} />
    );
  }
  if (!isInitialized) {
    // display nothing; a loading spinner will be handled elsewhere
    return <></>
  }

  if (volumetric) {
    console.log(">>>>> about to pass volumeId=", volumeId);
    viewer =
      <VolumeView
        volumeId={volumeId}
        segmentationId={segmentationId}
        preset3d={preset3d}
        toolGroup={toolGroup}
        toolGroup3d={toolGroup3d}
        modality={details.modality}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
  } else {
    viewer =
      <StackView
        segmentationId={segmentationId}
        toolGroup={toolGroup}
        frames={imageIds}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
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
            onPresetChange={(value) =>
              dispatch(setOption({ key: 'preset', value }))      // ← dispatch changes
            }
            renderingEngine={renderingEngine}
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
  )
}
