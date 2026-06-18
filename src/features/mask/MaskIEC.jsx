import React from 'react';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux'
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';

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
import { notify } from '@/lib/notify';
import { messages } from '@/lib/messages';

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
import { getMaskingDetails, setMaskingStatus } from '@/masking.js';
import { submitFinalCoords } from '@/masking';

import LoadingSpinner from '@/components/LoadingSpinner';
import { VolumeView } from '@/features/volume-view';
import { StackView } from '@/features/stack-view';
import { ToolsPanel } from '@/features/tools';
import OperationsPanel from '@/components/OperationsPanel';
import NavigationPanel from '@/components/NavigationPanel';
import FilterPanel from '@/components/FilterPanel';
import { DetailsPanel } from '@/features/details';

import RouteLayout from '@/components/RouteLayout';
import ViewportPlaceholder from '@/components/ViewportPlaceholder';

import './MaskIEC.css';

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation
} = cornerstoneTools;

function transformDetails(details, maskingDetails) {

  const maskingParams = JSON.parse(maskingDetails.masking_parameters);
  const maskingFilters = maskingParams?.noise !== undefined ? `Noise: ${maskingParams?.noise} ● Fill: ${maskingParams?.fill}` : '';
  const maskingFunction = maskingParams?.function !== undefined ? `${maskingParams?.function === 'sliceremove' ? 'slice-remove' : maskingParams?.function} ● ${maskingParams?.form}` : '';

  return {
    'IEC': details.image_equivalence_class_id,
    'Images in IEC': details.file_count,
    //'Processing Status': details.processing_status,
    'Review Status': details.review_status,
    'Masking Status': maskingDetails?.masking_status,
    'Masking Function': maskingFunction,
    'Masking Filters': maskingFilters,
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

export default function MaskIEC({ iec, vr, noIecs, maskingStatus, dicomType, dicomTypeOptions, onNext, onPrevious }) {

  // const [showLeftPanel, setShowLeftPanel] = useState(true);
  // const [showRightPanel, setShowRightPanel] = useState(true);
  // const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  // const toggleRightPanel = () => setShowRightPanel(v => !v);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const showLeftPanel = useSelector(s => s.presentation.panelConfig.open.left);
  const showRightPanel = useSelector(s => s.presentation.panelConfig.open.right);
  console.log("showLeftPanel:", showLeftPanel, "showRightPanel:", showRightPanel);
  const handleToggleLeft = () => dispatch(toggleLeftPanel());
  const handleToggleRight = () => dispatch(toggleRightPanel());

  const optionsForm = useSelector(state => state.options.form);
  const optionsFunction = useSelector(state => state.options.function);
  const optionsNoise = useSelector(state => state.options.noise);
  const optionsFill = useSelector(state => state.options.fill);
  const optionsDecimate = useSelector(state => state.options.decimate);
  const [renderingEngine, setRenderingEngine] = useState(cornerstone.getRenderingEngine("re1"));

  const [volumeId, setVolumeId] = useState()
  const [segmentationId, setSegmentationId] = useState();
  const [imageIds, setImageIds] = useState()

  const [toolGroup, setToolGroup] = useState();
  const [toolGroup3d, setToolGroup3d] = useState();
  const preset3d = useSelector(state => state.options.preset);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [volumetric, setVolumetric] = useState(true);
  const [details, setDetails] = useState(true);
  const [maskingDetails, setMaskingDetails] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [coords, setCoords] = useState();
  const loadRequestRef = useRef(0);

  let viewer;

  // console.log("MaskIEC renderingEngine:", renderingEngine);

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [showLeftPanel, showRightPanel]);

  useEffect(() => {
    const callback = (evt) => {
      // trigger a new event, to enable segmentation drawing
      console.log("[callback] AllowSegmentationDrawing firing...");
      cornerstone.triggerEvent(cornerstone.eventTarget, 'AllowSegmentationDrawing', {
        volumeId,
      });
    };

    // TODO: these string based event names need to be collected into
    // a library and accessed as enums
    cornerstone.eventTarget.addEventListener('VolumeReallyLoaded', callback);

    // cleanup the callback
    return () => {
      cornerstone.eventTarget.removeEventListener('VolumeReallyLoaded', callback);
    };
  }, []);

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
  }, [iec]);

  useLayoutEffect(() => {
    if (!iec) return; // nothing to load until an IEC is resolved
    console.log("MaskIEC useEffect[iec]:", iec);
    const requestId = ++loadRequestRef.current;
    let isCancelled = false;

    const initialize = async () => {
      setIsInitialized(false);
      const details = await getDicomDetails(iec);
      const maskingDetails = await getMaskingDetails(iec);
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> getDicomDetails & getMaskingDetails cancelled");
        return;
      }
      const { volumetric } = details;
      setDetails(details);
      setMaskingDetails(maskingDetails);

      let decimate_count = optionsDecimate;
      const requestedDecimateCount = decimate_count === 0
        ? 2000  // Maximum number of frames to load if decimate is set to 0 (no decimation)
        : decimate_count;

      setIsErrored(false);
      let volumeId = `mask-${iec}-decimate-${decimate_count}`;
      // append a random number 
      let segmentationId = `mask-${iec}-seg-${Math.floor(Math.random() * 10000)}`;

      const { frames } = await getIECInfo(iec, false, requestedDecimateCount);
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> getIECInfo cancelled");
        return;
      }
      const imageIds = frames;

      setImageIds(imageIds);

      setVolumeId(volumeId);
      setVolumetric(volumetric); // still update state
      setSegmentationId(segmentationId);

      try {
        if (volumetric) {
          await loadVolumeAndSegmentation(imageIds, volumeId, segmentationId);
          if (isCancelled || requestId !== loadRequestRef.current) {
            console.log("---------------> loadVolumeAndSegmentation cancelled");
            return;
          }
          dispatch(setTitle("Mask Volume"));
          dispatch(reset());
          dispatch(setMaskerConfig());
          dispatch(setVolumeConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
          // dispatch(setOption({ key: "function", value: Enums.FunctionOptions.MASK }));
          // dispatch(setOption({ key: "form", value: Enums.FormOptions.CYLINDER }));
        } else {
          await loadStackSegmentation(imageIds, segmentationId);
          if (isCancelled || requestId !== loadRequestRef.current) {
            console.log("---------------> loadStackSegmentation cancelled");
            return;
          }
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
        console.error(error);
        notify.error(error, messages.errors.loadImage);
        setIsErrored(true);
        return;
      }

      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> initialization cancelled after loading");
        return;
      }

      setIsInitialized(true);
      dispatch(setLoading(false));
    };

    // Catch failures from awaits that run before the inner try (e.g. the
    // detail/info fetches), so a thrown ApiError surfaces as a toast and a
    // clean viewport instead of an unhandled promise rejection.
    initialize().catch((error) => {
      if (isCancelled || requestId !== loadRequestRef.current) return;
      console.error(error);
      notify.error(error, messages.errors.loadImage);
      setIsErrored(true);
      dispatch(setLoading(false));
    });

    return () => {
      isCancelled = true;
      // Make sure we disable drawing of the volume
      // when we leave, so the next one doesn't attempt to draw
      // before it exists
      setIsInitialized(false);
      cornerstoneTools.segmentation.removeAllSegmentations();
      cornerstoneTools.segmentation.removeAllSegmentationRepresentations();
    };
  }, [iec, optionsDecimate]);

  // function handleApplyDecimate(decimateValue) {

  //   console.log("Applying decimate with value:", decimateValue);
  //   if (Number.isFinite(decimateValue) && decimateValue > 0) {
  //     setAppliedDecimate(decimateValue);
  //     return;
  //   }
  //   setAppliedDecimate(2000);
  // }

  function handleFilterAction({ maskingStatus: newMaskingStatus, dicomType: newDicomType }) {
    navigate(`/mask/vr/${vr}/*/${newMaskingStatus || 'All'}/${newDicomType || 'All'}`);
  }

  useHotkeys('e', () => handleOperationAction('expand'));
  useHotkeys('c', () => handleOperationAction('clear'));
  useHotkeys('a', () => handleOperationAction('accept'));
  useHotkeys('s', () => handleOperationAction('skip mask'));
  useHotkeys('n', () => handleOperationAction('nonmaskable mask'));

  async function handleOperationAction(action) {
    switch (action) {
      case "expand":
        await handleExpand();
        break;
      case "clear":
        handleClear();
        break;
      case "accept":
        // Only advance when the mask was actually submitted.
        if (await handleAccept()) onNext();
        break;
      case "skip mask":
      case "nonmaskable mask":
        try {
          await setMaskingStatus(iec, action);
          notify.success(
            action === "skip mask" ? messages.mask.skipped : messages.mask.notMaskable
          );
          onNext();
        } catch (error) {
          notify.error(error, messages.errors.saveStatus);
        }
        break;
      default:
        console.warn("Unknown action:", action);
    }
  }

  async function handleExpand() {
    if (!expanded && isSegFlat(segmentationId)) {
      notify.info(messages.maskValidation.flatSelection);
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
        console.log("[MaskIEC] Adding surface representation to", viewportId);
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
    notify.success(messages.mask.expanded);
  }

  function handleClear() {
    if (volumetric) {
      // Delete the current segmentation and add a new one (and activate it)
      // using a new randomly-named segmentation ID. This gets around a bug
      // with the 3d viewport not rendering after clearing a segmentation. 
      // Note: this does not prevent the error in updateSurfaceData for the
      // previous segmentation, however. 
      cornerstoneTools.segmentation.removeSegmentation(segmentationId);
      let newSegmentationId = `mask-${iec}-seg-${Math.floor(Math.random() * 10000)}`;

      volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
        volumeId: newSegmentationId,
      });

      cornerstoneTools.segmentation.addSegmentations([
        {
          segmentationId: newSegmentationId,
          representation: {
            // The type of segmentation
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            // The actual segmentation data, in the case of labelmap this is a
            // reference to the source volume of the segmentation.
            data: {
              volumeId: newSegmentationId,
            },
          },
        },
      ]);

      // triggering this event will cause the viewports to automatically 
      // add a representation for the new segmentation
      cornerstone.triggerEvent(cornerstone.eventTarget, 'VolumeReallyLoaded', {
        volumeId,
        segmentationId: newSegmentationId
      });

      setSegmentationId(newSegmentationId);
    } else {
      const imageIds = segmentation.getLabelmapImageIds(segmentationId);
      imageIds.forEach((imgId) => {
        const img = cornerstone.cache.getImage(imgId);
        const pixelData = img.getPixelData();
        if (pixelData) pixelData.fill(0);
      });

      // flag data as updated so it will redraw
      cornerstoneTools.segmentation
        .triggerSegmentationEvents
        .triggerSegmentationDataModified(segmentationId);
    }


    setExpanded(false);
  }

  async function handleAccept() {
    if (volumetric && !expanded) {
      notify.info(messages.maskValidation.expandFirst);
      return false;
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
    try {
      await submitFinalCoords(finalCoords, spacing, iec, selectedForm, selectedFunction, selectedNoise, selectedFill);
    } catch (error) {
      notify.error(error, messages.errors.submitMask);
      return false;
    }

    notify.success(messages.mask.submitted);
    return true;
  }



  if (!iec) {
    return (
      <RouteLayout
        routeName="mask-vr"
        leftPanel={
          <NavigationPanel
            onNext={onNext}
            onPrevious={onPrevious}
            currentId={iec}
            idLabel='IEC'
          />
        }
        middlePanel={
          <>
            {vr && (
              <FilterPanel
                vr={vr}
                maskingStatus={maskingStatus}
                dicomType={dicomType}
                dicomTypeOptions={dicomTypeOptions}
                onAction={handleFilterAction}
              />
            )}
            {noIecs && (
              <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300">
                No IECs were found for the selected filters.
              </div>
            )}
          </>
        }
        rightPanel={<div className="side-panel"><div className="wrapper" /></div>}
        showLeftPanel={showLeftPanel}
        showRightPanel={true}
      />
    );
  }

  // Load failures are surfaced as a toast; keep the viewport itself clean
  // with a neutral placeholder rather than an error card.
  if (isErrored) {
    return (
      <ViewportPlaceholder />
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
      routeName={vr ? "mask-vr" : undefined}
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
          // onApplyDecimate={handleApplyDecimate}
          />
        </>
        // : null
      }
      middlePanel={
        <>
          {vr && (
            <FilterPanel
              vr={vr}
              maskingStatus={maskingStatus}
              dicomType={dicomType}
              dicomTypeOptions={dicomTypeOptions}
              onAction={handleFilterAction}
            />
          )}
          {viewer}
          <OperationsPanel
            onAction={handleOperationAction}
          />
        </>
      }
      rightPanel={
        // showRightPanel ?
        <DetailsPanel details={transformDetails(details, maskingDetails)} />
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  )
}
