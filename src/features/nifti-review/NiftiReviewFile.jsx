import React from "react";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import {
  Enums,
  setVisualReviewConfig,
  setVolumeConfig,
  setNiftiConfig,
  toggleLeftPanel,
  toggleRightPanel,
  reset,
} from "@/features/presentationSlice";

import { setTitle, setLoading, setOption } from "@/features/optionSlice";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";
import { useHotkeys } from "react-hotkeys-hook";

import {
  Enums as NiftiEnums,
  createNiftiImageIdsAndCacheMetadata,
} from "@cornerstonejs/nifti-volume-loader";
import { volumeLoader } from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { toAbsoluteURL, startVolumeLoad } from "@/utilities";
import { getNiftiDetails, setNiftiStatus } from "@/visualreview";

import Header from "@/components/Header";

import LoadingSpinner from "@/components/LoadingSpinner";
import { VolumeView } from "@/features/volume-view";
import { ToolsPanel } from "@/features/tools";
import OperationsPanel from "@/components/OperationsPanel";
import NavigationPanel from "@/components/NavigationPanel";
import FilterPanel from "@/components/FilterPanel";
import { DetailsPanel } from "@/features/details";
import ViewportPlaceholder from "@/components/ViewportPlaceholder";

import { Context } from "@/components/Context.js";
import RouteLayout from "@/components/RouteLayout";
import ViewportGridPlaceholder from "@/components/ViewportGridPlaceholder";
import IecQueue from "@/components/IecQueue";

import "./NiftiReviewFile.css";

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

function transformDetails(details) {
  if (!details) {
    return {};
  }

  return {
    "File ID": details.file_id,
    "Import File Name": details.import_name,
    "Import File Path": details.import_path,
    "Posda File Path": details.posda_path,
    download_path: details.download_path,
    download_name: details.import_name,
  };
}

export default function NiftiReviewFile({
  file,
  vr,
  fileList,
  onNext = () => {},
  onPrevious = () => {},
  onSelectFile = () => {},
  routeName,
}) {
  console.log("[NiftiReviewFile] rendering, file:", file);

  // const [showLeftPanel, setShowLeftPanel] = useState(true);
  // const [showRightPanel, setShowRightPanel] = useState(true);
  // const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  // const toggleRightPanel = () => setShowRightPanel(v => !v);

  const dispatch = useDispatch();

  const showLeftPanel = useSelector(
    (s) => s.presentation.panelConfig.open.left,
  );
  const showRightPanel = useSelector(
    (s) => s.presentation.panelConfig.open.right,
  );
  console.log(
    "NiftiReviewFile: showLeftPanel:",
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

  const [toolGroup, setToolGroup] = useState(null);
  const [toolGroup3d, setToolGroup3d] = useState();
  const preset3d = useSelector((state) => state.options.preset);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [volumetric, setVolumetric] = useState(true);
  // null until fetched — the layout shell renders before the details arrive,
  // so the details panel gates on them instead of assuming they exist.
  const [details, setDetails] = useState(null);
  const loadRequestRef = useRef(0);

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
  }, [file]);

  useEffect(() => {
    console.log("NiftiReviewFile useEffect[file]:", file);
    const requestId = ++loadRequestRef.current;
    let isCancelled = false;
    // True once a newer file load has started (rapid navigation) or the
    // effect was cleaned up. Checked after EVERY await so a stale run can't
    // set state or clear the spinner for the wrong file.
    const isStale = () => isCancelled || requestId !== loadRequestRef.current;

    const initialize = async () => {
      setIsErrored(false);
      // Don't show the previous file's details while the new ones are
      // fetched — the layout shell stays mounted across navigation.
      setDetails(null);
      // Spinner up from the very first moment. The VR route also sets it on
      // navigation, but the single-file route doesn't set it at all — and
      // either way the load below is what takes it down.
      dispatch(setLoading(true));

      // Configure the UI NOW — before the (slow) image load — so the tools
      // panel and operations bar are fully populated behind the spinner
      // instead of appearing only when the load finishes.
      dispatch(setTitle("Nifti File Review"));
      dispatch(reset());
      dispatch(setVisualReviewConfig());
      dispatch(setVolumeConfig());
      dispatch(setNiftiConfig());
      dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
      dispatch(
        setOption({
          key: "leftClick",
          value: Enums.LeftClickOptions.WINDOW_LEVEL,
        }),
      );
      dispatch(
        setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }),
      );

      let volumeId = `vol-${file}`;
      let segmentationId = `vol-${file}-seg`;

      try {
        const details = await getNiftiDetails(file);
        if (isStale()) return;
        setDetails(details);

        if (details.download_path === undefined) {
          notify.error(messages.errors.missingNiftiFile);
          setIsErrored(true);
          dispatch(setLoading(false));
          return;
        }

        let rel_url = details.download_path;
        if (details.is_zipped) {
          rel_url += ".gz";
        }
        const url = toAbsoluteURL(rel_url);
        const imageIds = await createNiftiImageIdsAndCacheMetadata({ url });
        if (isStale()) return;
        setImageIds(imageIds);
        let volume = cornerstone.cache.getVolume(volumeId);
        if (!volume) {
          volume = await volumeLoader.createAndCacheVolume(volumeId, {
            imageIds,
          });
          if (isStale()) return;
        }
        try {
          // The completion callback — not the volume-shell creation above —
          // takes the spinner down, once the pixel data has actually
          // streamed in.
          startVolumeLoad(volume, () => {
            if (isStale()) return;
            dispatch(setLoading(false));
          });
        } catch (error) {
          console.log("exiting initialize early");
          console.log(error);
          dispatch(setLoading(false));
          return;
        }
      } catch (error) {
        console.error(error);
        if (isStale()) return;
        notify.error(error, messages.errors.loadImage);
        setIsErrored(true);
        dispatch(setLoading(false));
        return;
      }

      // The viewer mounts now — images are still arriving; the spinner stays
      // up until the load-completion callback fires. On a cached revisit the
      // callback has already fired synchronously and the spinner is down.
      setIsInitialized(true);
      setVolumeId(volumeId);
      setSegmentationId(segmentationId);
    };

    initialize();

    // Return initialized to false when unmounting
    // so we don't try to draw the next volume before it's loaded!
    return () => {
      isCancelled = true;
      setIsInitialized(false);
      // Leaving mid-load: the completion callback for this file is stale and
      // will never clear the spinner — don't leave it up. A follow-up load
      // turns it straight back on.
      dispatch(setLoading(false));
      cornerstoneTools.segmentation.removeAllSegmentations();
      cornerstoneTools.segmentation.removeAllSegmentationRepresentations();
    };
  }, [file]);

  useHotkeys("g", () => handleOperationsAction("good"));
  useHotkeys("b", () => handleOperationsAction("bad"));
  useHotkeys("l", () => handleOperationsAction("blank"));
  useHotkeys("s", () => handleOperationsAction("scout"));
  useHotkeys("o", () => handleOperationsAction("other"));

  const NIFTI_STATUS_LABELS = {
    good: "Good",
    bad: "Bad",
    blank: "Blank",
    scout: "Scout",
    other: "Other",
  };

  async function handleOperationsAction(action) {
    const label = NIFTI_STATUS_LABELS[action];
    if (!label) {
      console.warn("Unknown action:", action);
      return;
    }
    try {
      await setNiftiStatus(file, label);
      notify.success(messages.status.set(label));
      onNext();
    } catch (error) {
      notify.error(error, messages.errors.saveStatus);
    }
  }

  async function handleFilterAction(action) {
    let a = "a";
  }

  // The layout shell (nav, tools panel, operations bar) renders immediately —
  // before the detail fetch and the image load — with the app-wide spinner
  // floating above it, exactly like the mask route. The viewer mounts once
  // the volume shell exists and fills in as the images stream.
  if (isErrored) {
    // Load failures are surfaced as a toast; keep the viewport itself clean
    // with a neutral placeholder so navigation still works.
    viewer = <ViewportPlaceholder />;
  } else if (isInitialized) {
    viewer = (
      <VolumeView
        volumeId={volumeId}
        segmentationId={segmentationId}
        preset3d={preset3d}
        toolGroup={toolGroup}
        toolGroup3d={toolGroup3d}
        modality={null}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
    );
  } else {
    // Images still loading: show the empty 2×2 viewport grid so the layout
    // is there from the first frame.
    viewer = <ViewportGridPlaceholder />;
  }

  return (
    <RouteLayout
      routeName={routeName}
      leftPanel={
        // showLeftPanel ?
        <>
          {vr && (
            <NavigationPanel
              onNext={onNext}
              onPrevious={onPrevious}
              currentId={file}
              idLabel="File"
            />
          )}
          {vr && fileList && (
            <IecQueue
              kind="nifti"
              items={fileList}
              currentId={file}
              onSelect={onSelectFile}
              idLabel="File"
              hint="← → navigate · G good · B bad · L blank · S scout · O other"
            />
          )}
          {/* The shell renders before the effect that creates the tool
              groups has run — ToolsPanel calls toolGroup.addTool on mount,
              so it must not mount until they exist. */}
          {toolGroup && toolGroup3d && (
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
          {/* {vr &&
            <FilterPanel
              onAction={handleFilterAction}
            />
          } */}
          {viewer}
          <OperationsPanel onAction={handleOperationsAction} />
        </>
      }
      rightPanel={
        // showRightPanel ?
        details ? (
          <DetailsPanel details={transformDetails(details)} />
        ) : (
          <div className="side-panel">
            <div className="wrapper" />
          </div>
        )
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
