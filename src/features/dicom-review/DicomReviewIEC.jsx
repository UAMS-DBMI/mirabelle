import React from "react";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

import {
  Enums,
  setVisualReviewConfig,
  setStackConfig,
  setVolumeConfig,
  toggleLeftPanel,
  toggleRightPanel,
  reset,
} from "@/features/presentationSlice";

import {
  setTitle,
  setTitleDetail,
  setLoading,
  setOption,
} from "@/features/optionSlice";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";
import { useHotkeys } from "react-hotkeys-hook";
import { wadouri } from "@cornerstonejs/dicom-image-loader";

import createImageIdsAndCacheMetaData from "@/lib/createImageIdsAndCacheMetaData";
import { volumeLoader } from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  loadVolumeAndSegmentation,
  getOtherIECsForFOR,
  getImageIdsFromIEC,
  loadStackSegmentation,
  makeRoomForStackExam,
  loadVolume,
  loadVolumeAsync,
  loadVolumeSegmentation,
  loadSEGSegmentation,
  getFiles,
  fetchFileAsArrayBuffer,
  getIECInfo,
} from "@/utilities";
import {
  getDicomDetails,
  setDicomStatus,
  setMaskingFlag,
} from "@/visualreview";
import { getMaskingDetails } from "@/masking.js";
import { describeMaskingParameters } from "@/lib/maskingParameters";
import { usePreviousMaskOverlay } from "@/features/mask/usePreviousMaskOverlay";

import Header from "@/components/Header";

import LoadingSpinner from "@/components/LoadingSpinner";
import { VolumeView } from "@/features/volume-view";
import { StackView } from "@/features/stack-view";
import { ToolsPanel } from "@/features/tools";
import OperationsPanel from "@/components/OperationsPanel";
import NavigationPanel from "@/components/NavigationPanel";
import FilterPanel from "@/components/FilterPanel";
import { DetailsPanel } from "@/features/details";
import { SegPanel } from "@/features/seg";
import ViewportPlaceholder from "@/components/ViewportPlaceholder";

import { Context } from "@/components/Context.js";
import RouteLayout from "@/components/RouteLayout";

import "./DicomReviewIEC.css";

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

function transformDetails(details, maskingDetails, imageId) {
  let ret = {
    IEC: details.image_equivalence_class_id,
    "Images in IEC": details.file_count,
    //'Processing Status': details.processing_status,
    "Review Status": details.review_status,
    // The masking record, when this IEC has one — the same rows the mask
    // routes show, so an exam reads the same wherever it's opened. An IEC
    // that has never been masked has no status and no parameters, and these
    // rows simply don't appear.
    "Masking Status": maskingDetails?.masking_status,
    ...describeMaskingParameters(maskingDetails?.masking_parameters),
    Modality: details.modality,
    "Patient ID": details.patient_id,
    "Series Instance UID": details.series_instance_uid,
    "Series Description": details.series_description,
    "Body Part Examined": details.body_part_examined,
    Path: details.path,
    download_path: details.download_path,
    download_name: details.download_name,
  };
  if (imageId) {
    ret["Current Image ID"] = imageId;
  }

  return ret;
}

export default function DicomReviewIEC({
  iec,
  vr,
  reviewStatus,
  dicomType,
  dicomTypeOptions,
  onNext = () => {},
  onPrevious = () => {},
  routeName,
}) {
  console.log("[DicomReviewIEC] rendering, iec:", iec);

  // const [showLeftPanel, setShowLeftPanel] = useState(true);
  // const [showRightPanel, setShowRightPanel] = useState(true);
  // const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  // const toggleRightPanel = () => setShowRightPanel(v => !v);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const showLeftPanel = useSelector(
    (s) => s.presentation.panelConfig.open.left,
  );
  const showRightPanel = useSelector(
    (s) => s.presentation.panelConfig.open.right,
  );
  console.log(
    "DicomReviewIEC: showLeftPanel:",
    showLeftPanel,
    "showRightPanel:",
    showRightPanel,
  );
  const handleToggleLeft = () => dispatch(toggleLeftPanel());
  const handleToggleRight = () => dispatch(toggleRightPanel());

  const optionsView = useSelector((state) => state.options.view);
  const currentImageId = useSelector((state) => state.options.currentImageId);
  const [renderingEngine, setRenderingEngine] = useState(
    cornerstone.getRenderingEngine("re1"),
  );

  const [volumeId, setVolumeId] = useState();
  const [segmentationId, setSegmentationId] = useState();
  const [imageIds, setImageIds] = useState();

  const [toolGroup, setToolGroup] = useState();
  const [toolGroup3d, setToolGroup3d] = useState();
  const preset3d = useSelector((state) => state.options.preset);
  const optionsDecimate = useSelector((state) => state.options.decimate);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [volumetric, setVolumetric] = useState(true);
  const [details, setDetails] = useState(true);
  const [maskingDetails, setMaskingDetails] = useState(null);

  const [isSeg, setIsSeg] = useState(false);
  const [segBaseIEC, setSegBaseIEC] = useState(false);
  const [segMetadata, setSegMetadata] = useState([]);
  const loadRequestRef = useRef(0);

  // The submitted mask's amber overlay, when this IEC has a masking record —
  // the reviewer flagging exams for masking (the "f" hotkey) can see what any
  // existing mask already covers. Shared with the mask and mask-review routes.
  usePreviousMaskOverlay({
    isInitialized,
    volumetric,
    volumeId,
    imageIds,
    maskingDetails,
  });

  // Factor out the idea of "force stack view" from options
  // so we can use it as a useEffect dependency, and it
  // will only trigger a change when the "force stack view"
  // status changes. That is, it will NOT trigger an update
  // when view changes to something else (like projection).
  //const forceStackView = optionsView === 'stack';

  let viewer;

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
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
      ToolGroupManager.destroyToolGroup("toolGroup2d");
      ToolGroupManager.destroyToolGroup("toolGroup3d");
      // Do not delete the RenderingEngine here, it needs
      // to stay, for now
    };
  }, [iec]);

  useLayoutEffect(() => {
    if (!iec) return; // nothing to load when IEC is not selected
    console.log("DicomReviewIEC useEffect[iec]:", iec);
    const requestId = ++loadRequestRef.current;
    let isCancelled = false;

    const initialize = async () => {
      // Don't leave the previous exam's context beside the title while the new
      // one is fetched.
      dispatch(setTitleDetail(null));

      const details = await getDicomDetails(iec);
      // Auxiliary to this route (it feeds the details rows and the submitted
      // mask overlay), so a masking-endpoint failure must not take down the
      // review of the exam itself.
      const maskingDetails = await getMaskingDetails(iec).catch(() => null);
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log(
          "---------------> getDicomDetails & getMaskingDetails cancelled",
        );
        return;
      }
      setMaskingDetails(maskingDetails);
      let { modality, volumetric } = details;

      let isSeg = false;
      let iecList = null;
      let segBaseIEC = null;
      let segBaseDetails = null;
      let segBaseModality = modality;

      if (modality === "SEG") {
        isSeg = true;
        iecList = await getOtherIECsForFOR(iec);
        if (iecList.length > 0) {
          segBaseIEC = iecList[0].image_equivalence_class_id;
          segBaseDetails = await getDicomDetails(segBaseIEC);
          volumetric = segBaseDetails.volumetric;
          segBaseModality = segBaseDetails.modality;
        }
      }
      setIsSeg(isSeg);

      // A SEG is rendered as a volume with its mask overlaid whenever we have
      // a base image series to attach it to — regardless of that series'
      // `volumetric` flag. Only plain (non-SEG) series follow their own flag.
      const hasSegBase = isSeg && segBaseIEC != null;
      const renderAsVolume = hasSegBase || (!isSeg && volumetric);

      // A SEG with no base image series can't be overlaid onto anything, so
      // fall back to showing the segmentation's own frames as a stack and let
      // the user know why.
      if (isSeg && !hasSegBase) {
        notify.info(messages.info.segNoBaseImage(iec));
      }

      //if (optionsView === 'stack') {
      //  console.log("DicomReviewIEC: forcing stack view");
      //  volumetric = false; // force stack view
      //}

      const finalDetails = { ...details };
      if (isSeg && segBaseDetails) {
        finalDetails.segBaseModality = segBaseModality;
      }

      setDetails(finalDetails);
      dispatch(
        setTitleDetail(
          [
            iec,
            finalDetails.segBaseModality || details.modality,
            details.series_description,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );

      let decimate_count = optionsDecimate;
      const requestedDecimateCount =
        decimate_count === 0
          ? 2000 // Maximum number of frames to load if decimate is set to 0 (no decimation)
          : decimate_count;

      setIsErrored(false);
      let volumeId = `dicom-review-${iec}-decimate-${decimate_count}`;
      let segmentationId = `dicom-review-${iec}-seg`;

      // Load the base image series' frames for a SEG with a base; otherwise
      // (plain series, or a SEG without a base) load the IEC's own frames.
      const framesIEC = segBaseIEC ?? iec;
      const { frames } = await getIECInfo(
        framesIEC,
        false,
        requestedDecimateCount,
      );
      // A run superseded by fast navigation must stop before the load below:
      // makeRoomForExam stamps this exam as most-recently-used and evicts to
      // fit it, so an abandoned run resuming here can evict the volume the
      // live run just created ("imageVolume ... does not exist").
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> getIECInfo cancelled");
        return;
      }

      let imageIds = frames;
      setImageIds(imageIds);

      setVolumeId(volumeId);
      setVolumetric(renderAsVolume); // still update state
      setSegmentationId(segmentationId);

      let segLoadingId;
      try {
        if (renderAsVolume) {
          if (!isSeg) {
            // Load the volume directly if it's not a seg. No need to
            // pass a callback, we don't care about when it finishes
            await loadVolume(imageIds, volumeId, segmentationId);
          } else {
            segLoadingId = notify.loading(messages.loading.segVolume);
            // this version of loadVolume only resolves when the volume
            // has been fully loaded.
            // TODO: We should instead use the normal version and provide
            // a callback that will load the segmentation. Currently
            // this doens't work because segMetadata is being passed
            // to some components and it will break without it.
            await loadVolumeAsync(imageIds, volumeId, segmentationId);

            const segFileIds = await getFiles(iec);
            if (segFileIds.length > 1) {
              throw new Error(messages.errors.multipleSegImages(iec));
            }

            const data = await fetchFileAsArrayBuffer(segFileIds[0]);

            const segSegments = await loadSEGSegmentation(
              data,
              imageIds,
              segmentationId,
            );
            // NOTE: At some point down in the bowels, the values
            // in the segment list are used for React keys, so make sure
            // the segmentIndex is unique (handled in loadSEGSegmentation)
            setSegMetadata(segSegments.segments);

            notify.dismiss(segLoadingId);
          }

          dispatch(setTitle("DICOM Volume Review"));
          dispatch(reset());
          dispatch(setVisualReviewConfig());
          dispatch(setVolumeConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
        } else {
          // await loadVolumeAsync(imageIds, volumeId, segmentationId);
          // await loadStackSegmentation(imageIds, segmentationId);
          // The stack viewport loads the frames on demand as pinned wadouri
          // images; register them so the exam-LRU eviction can free them.
          makeRoomForStackExam(imageIds);
          dispatch(setTitle("DICOM Stack Review"));
          dispatch(reset());
          dispatch(setVisualReviewConfig());
          dispatch(setStackConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
        }
        dispatch(
          setOption({
            key: "leftClick",
            value: Enums.LeftClickOptions.WINDOW_LEVEL,
          }),
        );
        dispatch(
          setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }),
        );
      } catch (error) {
        console.error(error);
        notify.dismiss(segLoadingId);
        // A load abandoned by navigation may fail against torn-down state, or
        // lose a cache reservation the live exam has since taken — that's
        // expected, and must not flag the exam now on screen as errored.
        if (isCancelled || requestId !== loadRequestRef.current) return;
        // Surface load failures as a toast and keep the viewport clean
        // (a neutral placeholder is rendered instead of an error card).
        notify.error(error, messages.errors.loadImage);
        setIsErrored(true);
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

    // Return initialized to false when unmounting
    // so we don't try to draw the next volume before it's loaded!
    return () => {
      isCancelled = true;
      setIsInitialized(false);
      cornerstoneTools.segmentation.removeAllSegmentations();
      cornerstoneTools.segmentation.removeAllSegmentationRepresentations();
    };
  }, [iec, optionsDecimate]);

  useHotkeys("g", () => handleOperationsAction("good"));
  useHotkeys("b", () => handleOperationsAction("bad"));
  useHotkeys("l", () => handleOperationsAction("blank"));
  useHotkeys("s", () => handleOperationsAction("scout"));
  useHotkeys("o", () => handleOperationsAction("other"));
  useHotkeys("f", () => handleOperationsAction("flag"));

  const DICOM_STATUS_LABELS = {
    good: "Good",
    bad: "Bad",
    blank: "Blank",
    scout: "Scout",
    other: "Other",
  };

  async function handleOperationsAction(action) {
    try {
      if (action === "flag") {
        await setDicomStatus(iec, "Flagged");
        await setMaskingFlag(iec);
        notify.success(messages.status.flaggedForMasking);
      } else {
        const label = DICOM_STATUS_LABELS[action];
        if (!label) {
          console.warn("Unknown action:", action);
          return;
        }
        await setDicomStatus(iec, label);
        notify.success(messages.status.set(label));
      }
      onNext();
    } catch (error) {
      notify.error(error, messages.errors.saveStatus);
    }
  }

  async function handleFilterAction({
    reviewStatus: newStatus,
    dicomType: newType,
  }) {
    navigate(
      `/review/dicom/vr/${vr}/*/${newStatus || "All"}/${newType || "All"}`,
    );
  }

  // Load failures are surfaced as a toast; keep the viewport itself clean
  // with a neutral placeholder rather than an error card.
  if (isErrored) {
    return <ViewportPlaceholder />;
  }
  // When IEC is not selected yet, render full app with controls and message
  if (!iec) {
    return (
      <RouteLayout
        routeName={routeName}
        leftPanel={
          <>
            {vr && (
              <NavigationPanel
                onNext={onNext}
                onPrevious={onPrevious}
                currentId={iec}
                idLabel="IEC"
              />
            )}
            {toolGroup && (
              <ToolsPanel
                toolGroup={toolGroup}
                toolGroup3d={toolGroup3d}
                preset3d={preset3d}
                onPresetChange={(value) =>
                  dispatch(setOption({ key: "preset", value }))
                }
              />
            )}
          </>
        }
        middlePanel={
          <>
            {vr && (
              <FilterPanel
                vr={vr}
                reviewStatus={reviewStatus}
                dicomType={dicomType}
                dicomTypeOptions={dicomTypeOptions}
                onAction={({ reviewStatus: s, dicomType: t }) =>
                  navigate(
                    [
                      "/review",
                      "dicom",
                      "vr",
                      vr,
                      "*",
                      s || "All",
                      t || "All",
                    ].join("/"),
                  )
                }
              />
            )}
            <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300">
              {messages.filters.noResults}
            </div>
          </>
        }
        rightPanel={
          <div className="side-panel">
            <div className="wrapper" />
          </div>
        }
        showLeftPanel={showLeftPanel}
        showRightPanel={true}
      />
    );
  }

  if (!isInitialized) {
    return null;
  }

  if (volumetric) {
    viewer = (
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
    );
  } else {
    viewer = (
      <StackView
        toolGroup={toolGroup}
        frames={imageIds}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
    );
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
          {vr && (
            <NavigationPanel
              onNext={onNext}
              onPrevious={onPrevious}
              currentId={iec}
              idLabel="IEC"
            />
          )}
          {toolGroup && (
            <ToolsPanel
              toolGroup={toolGroup}
              toolGroup3d={toolGroup3d}
              preset3d={preset3d}
              onPresetChange={
                (value) => dispatch(setOption({ key: "preset", value })) // ← dispatch changes
              }
            />
          )}
        </>
        // : null
      }
      middlePanel={
        <>
          {vr && (
            <FilterPanel
              vr={vr}
              reviewStatus={reviewStatus}
              dicomType={dicomType}
              dicomTypeOptions={dicomTypeOptions}
              onAction={handleFilterAction}
            />
          )}
          {viewer}
          <OperationsPanel onAction={handleOperationsAction} />
        </>
      }
      rightPanel={
        // showRightPanel ?
        <>
          {isSeg && (
            <SegPanel segments={segMetadata} segmentationId={segmentationId} />
          )}
          <DetailsPanel
            details={transformDetails(details, maskingDetails, currentImageId)}
          />
        </>
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
