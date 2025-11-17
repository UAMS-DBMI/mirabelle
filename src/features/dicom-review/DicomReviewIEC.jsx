import React from 'react';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import {
  Enums,
  setVisualReviewConfig,
  setStackConfig,
  setVolumeConfig,
  toggleLeftPanel,
  toggleRightPanel,
  reset,
} from '@/features/presentationSlice';

import { setTitle, setLoading, setOption } from '@/features/optionSlice';
import toast from 'react-hot-toast';
import { useHotkeys } from 'react-hotkeys-hook';
import { wadouri } from "@cornerstonejs/dicom-image-loader"

import createImageIdsAndCacheMetaData from "@/lib/createImageIdsAndCacheMetaData";
import { volumeLoader } from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  loadVolumeAndSegmentation,
  getOtherIECsForFOR,
  getImageIdsFromIEC,
  loadStackSegmentation,
  loadVolume,
  loadVolumeAsync,
  loadVolumeSegmentation,
  loadSEGSegmentation,
  getFiles,
  fetchFileAsArrayBuffer,
  getIECInfo
} from "@/utilities";
import { getDicomDetails, setDicomStatus, setMaskingFlag } from '@/visualreview';

import Header from '@/components/Header';

import LoadingSpinner from '@/components/LoadingSpinner';
import { VolumeView } from '@/features/volume-view';
import { StackView } from '@/features/stack-view';
import { ToolsPanel } from '@/features/tools';
import OperationsPanel from '@/components/OperationsPanel';
import NavigationPanel from '@/components/NavigationPanel';
import FilterPanel from '@/components/FilterPanel';
import { DetailsPanel } from '@/features/details';
import { SegPanel } from '@/features/seg';
import ErrorPanel from '@/components/ErrorPanel';

import { Context } from '@/components/Context.js';
import RouteLayout from '@/components/RouteLayout';

import './DicomReviewIEC.css';

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation
} = cornerstoneTools;

function transformDetails(details, imageId) {

  let ret = {
    'IEC': details.image_equivalence_class_id,
    'Images in IEC': details.file_count,
    //'Processing Status': details.processing_status,
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
  if (imageId) {
    ret['Current Image ID'] = imageId;
  }

  return ret;
}


export default function DicomReviewIEC({ iec, vr, reviewStatus, dicomType, dicomTypeOptions, onNext, onPrevious, routeName }) {
  console.log("[DicomReviewIEC] rendering, iec:", iec);

  // const [showLeftPanel, setShowLeftPanel] = useState(true);
  // const [showRightPanel, setShowRightPanel] = useState(true);
  // const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  // const toggleRightPanel = () => setShowRightPanel(v => !v);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const showLeftPanel = useSelector(s => s.presentation.panelConfig.open.left);
  const showRightPanel = useSelector(s => s.presentation.panelConfig.open.right);
  console.log("DicomReviewIEC: showLeftPanel:", showLeftPanel, "showRightPanel:", showRightPanel);
  const handleToggleLeft = () => dispatch(toggleLeftPanel());
  const handleToggleRight = () => dispatch(toggleRightPanel());

  const optionsView = useSelector(state => state.options.view);
  const currentImageId = useSelector(state => state.options.currentImageId);
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

  const [isSeg, setIsSeg] = useState(false);
  const [segBaseIEC, setSegBaseIEC] = useState(false);
  const [segMetadata, setSegMetadata] = useState([]);

  // Factor out the idea of "force stack view" from options
  // so we can use it as a useEffect dependency, and it
  // will only trigger a change when the "force stack view"
  // status changes. That is, it will NOT trigger an update
  // when view changes to something else (like projection).
  //const forceStackView = optionsView === 'stack';

  let viewer;

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [showLeftPanel, showRightPanel]);

  useLayoutEffect(() => {
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
    if (!iec) return; // nothing to load when IEC is not selected
    console.log("DicomReviewIEC useEffect[iec]:", iec);

    const initialize = async () => {
      const details = await getDicomDetails(iec);
      let { modality, volumetric } = details;

      let isSeg = false;
      let iecList = null;
      let segBaseIEC = null;
      let segBaseDetails = null;
      let segBaseModality = modality;

      if (modality === 'SEG') {
        isSeg = true;
        iecList = await getOtherIECsForFOR(iec);
        if (iecList.length > 0) {
          segBaseIEC = iecList[0].image_equivalence_class_id;
          segBaseDetails = await getDicomDetails(segBaseIEC);
          volumetric = segBaseDetails.volumetric;
          segBaseModality = segBaseDetails.modality;
        }
      }
      setIsSeg(isSeg)

      //if (optionsView === 'stack') {
      //  console.log("DicomReviewIEC: forcing stack view");
      //  volumetric = false; // force stack view
      //}

      const finalDetails = { ...details };
      if (isSeg && segBaseDetails) {
        finalDetails.segBaseModality = segBaseModality;
      }

      setDetails(finalDetails);

      setIsErrored(false);
      let volumeId = `dicom-review-${iec}`;
      let segmentationId = `dicom-review-${iec}-seg`;

      let imageIds = [];

      if (!isSeg) {
        const { frames } = await getIECInfo(iec);
        imageIds = frames;
      } else {
        const { frames } = await getIECInfo(segBaseIEC);
        imageIds = frames;
      }
      setImageIds(imageIds);

      setVolumeId(volumeId);
      setVolumetric(volumetric); // still update state
      setSegmentationId(segmentationId);

      try {
        if (volumetric) {
          if (!isSeg) {
            // Load the volume directly if it's not a seg. No need to
            // pass a callback, we don't care about when it finishes
            await loadVolume(imageIds, volumeId, segmentationId);

          } else {
            const loadingId = toast.loading("Loading volume for SEG...");
            // this version of loadVolume only resolves when the volume
            // has been fully loaded. 
            // TODO: We should instead use the normal version and provide
            // a callback that will load the segmentation. Currently
            // this doens't work because segMetadata is being passed
            // to some components and it will break without it.
            await loadVolumeAsync(imageIds, volumeId, segmentationId);

            const segFileIds = await getFiles(iec);
            if (segFileIds.length > 1) {
              throw new Error("More than one SEG image found for IEC:", iec);
            }

            const data = await fetchFileAsArrayBuffer(segFileIds[0]);

            const segSegments = await loadSEGSegmentation(data, imageIds, segmentationId);
            // NOTE: At some point down in the bowels, the values
            // in the segment list are used for React keys, so make sure
            // the segmentIndex is unique (handled in loadSEGSegmentation)
            setSegMetadata(segSegments.segments);

            toast.dismiss(loadingId);
          }

          dispatch(setTitle("DICOM Volume Review"));
          dispatch(reset());
          dispatch(setVisualReviewConfig());
          dispatch(setVolumeConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
        } else {
          // await loadVolumeAsync(imageIds, volumeId, segmentationId);
          // await loadStackSegmentation(imageIds, segmentationId);
          dispatch(setTitle("DICOM Stack Review"));
          dispatch(reset());
          dispatch(setVisualReviewConfig());
          dispatch(setStackConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
        }
        dispatch(setOption({ key: "leftClick", value: Enums.LeftClickOptions.WINDOW_LEVEL }));
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

    // Return initialized to false when unmounting
    // so we don't try to draw the next volume before it's loaded!
    return () => {
      setIsInitialized(false);
      cornerstoneTools.segmentation.removeAllSegmentations();
      cornerstoneTools.segmentation.removeAllSegmentationRepresentations();
    };
  }, [iec]);

  useHotkeys('g', () => handleOperationsAction('good'));
  useHotkeys('b', () => handleOperationsAction('bad'));
  useHotkeys('l', () => handleOperationsAction('blank'));
  useHotkeys('s', () => handleOperationsAction('scout'));
  useHotkeys('o', () => handleOperationsAction('other'));
  useHotkeys('f', () => handleOperationsAction('flag'));

  async function handleOperationsAction(action) {
    switch (action) {
      case "good":
        await setDicomStatus(iec, "Good");
        toast.success("Status set to Good!");
        break;
      case "bad":
        await setDicomStatus(iec, "Bad");
        toast.success("Status set to Bad!");
        break;
      case "blank":
        await setDicomStatus(iec, "Blank");
        toast.success("Status set to Blank!");
        break;
      case "scout":
        await setDicomStatus(iec, "Scout");
        toast.success("Status set to Scout!");
        break;
      case "other":
        await setDicomStatus(iec, "Other");
        toast.success("Status set to Other!");
        break;
      case "flag":
        await setDicomStatus(iec, "Flagged");
        await setMaskingFlag(iec);
        toast.success("Flagged for Masking!");
        break;
      default:
        console.log("Unknown action:", action);
    }
  }

  async function handleFilterAction({ reviewStatus: newStatus, dicomType: newType }) {
    navigate(`/review/dicom/vr/${vr}/*/${newStatus || 'All'}/${newType || 'All'}`);
  }

  // short-circuit if not loaded yet
  if (isErrored) {
    return (
      <ErrorPanel error={errorMessage.message} />
    );
  }
  // When IEC is not selected yet, render full app with controls and message
  if (!iec) {
    return (
      <RouteLayout
        routeName={routeName}
        leftPanel={
          <>
            {vr &&
              <NavigationPanel
                onNext={onNext}
                onPrevious={onPrevious}
                currentId={iec}
                idLabel='IEC'
              />
            }
            {toolGroup && (
              <ToolsPanel
                toolGroup={toolGroup}
                toolGroup3d={toolGroup3d}
                preset3d={preset3d}
                onPresetChange={(value) =>
                  dispatch(setOption({ key: 'preset', value }))
                }
              />
            )}
          </>
        }
        middlePanel={
          <>
            {vr &&
              <FilterPanel
                vr={vr}
                reviewStatus={reviewStatus}
                dicomType={dicomType}
                dicomTypeOptions={dicomTypeOptions}
                onAction={({ reviewStatus: s, dicomType: t }) => navigate([ '/review', 'dicom', 'vr', vr, '*', (s || 'All'), (t || 'All') ].join('/'))}
              />
            }
            <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300">
              No IECs were found for the selected filters.
            </div>
          </>
        }
        rightPanel={<div className="side-panel"><div className="wrapper" /></div>}
        showLeftPanel={showLeftPanel}
        showRightPanel={true}
      />
    );
  }

  if (!isInitialized) {
    return null;
  }

  if (volumetric) {
    viewer =
      <VolumeView
        volumeId={volumeId}
        segmentationId={segmentationId}
        preset3d={preset3d}
        toolGroup={toolGroup}
        toolGroup3d={toolGroup3d}
        modality={details.segBaseModality || details.modality}
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

  return (
    <RouteLayout
      // topPanel={
      //   // showTopPanel ?
      //   <>
      //     {vr && <FilterPanel />}
      //   </>
      //   // : null
      // }
      routeName={routeName}
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
          {toolGroup && (
            <ToolsPanel
              toolGroup={toolGroup}
              toolGroup3d={toolGroup3d}
              preset3d={preset3d}
              onPresetChange={(value) =>
                dispatch(setOption({ key: 'preset', value }))      // ← dispatch changes
              }
            />
          )}
        </>
        // : null
      }
      middlePanel={
        <>
          {vr && 
            <FilterPanel
              vr={vr}
              reviewStatus={reviewStatus}
              dicomType={dicomType}
              dicomTypeOptions={dicomTypeOptions}
              onAction={handleFilterAction}
            />
          }
          {viewer}
          <OperationsPanel
            onAction={handleOperationsAction}
          />
        </>
      }
      rightPanel={
        // showRightPanel ?
        <>
          {isSeg && <SegPanel segments={segMetadata} segmentationId={segmentationId} />}
          <DetailsPanel details={transformDetails(details, currentImageId)} />
        </>
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  )
}
