import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHotkeys } from "react-hotkeys-hook";

import * as cornerstoneTools from "@cornerstonejs/tools";

import { Enums, setQCConfig, reset } from "@/features/presentationSlice";
import { setTitle, setLoading, setOption } from "@/features/optionSlice";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";
import {
  getQCSeriesFiles,
  setQCSeriesStatus,
  buildSeriesImageIds,
  buildFileByUrlMap,
} from "@/qc";

import RouteLayout from "@/components/RouteLayout";
import NavigationPanel from "@/components/NavigationPanel";
import ViewportPlaceholder from "@/components/ViewportPlaceholder";
import { StackView } from "@/features/stack-view";
import { ToolsPanel } from "@/features/tools";

import QCProgressHeader from "./QCProgressHeader";
import QCFilterPanel from "./QCFilterPanel";
import QCOperationsPanel from "./QCOperationsPanel";
import QCDicomDump from "./QCDicomDump";
import CineControls from "./CineControls";

import "./QCAssignment.css";

const { ToolGroupManager } = cornerstoneTools;

// Server-accepted qc_status values and their note rules.
const QC_ACTIONS = {
  approved: { noteRequired: false },
  rejected: { noteRequired: true },
  flagged: { noteRequired: true },
};

/**
 * Orchestrator for QC-ing one series of an assignment: stack viewer with
 * cine, QC actions with notes, progress header, and a client-side DICOM
 * dump that follows the displayed frame.
 */
export default function QCAssignment({
  assignmentId,
  seriesUid,
  series,
  assignmentData,
  readOnly,
  noSeries,
  qcStatus,
  modality,
  modalityOptions,
  onNext = () => {},
  onPrevious = () => {},
  onFilter = () => {},
  onStatusChanged = () => {},
  routeName,
}) {
  const dispatch = useDispatch();

  const showLeftPanel = useSelector(
    (s) => s.presentation.panelConfig.open.left,
  );
  const showRightPanel = useSelector(
    (s) => s.presentation.panelConfig.open.right,
  );

  const [toolGroup, setToolGroup] = useState();
  const [imageIds, setImageIds] = useState();
  const [fileByUrl, setFileByUrl] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);
  const [note, setNote] = useState("");
  const noteInputRef = useRef(null);
  const loadRequestRef = useRef(0);

  const assignedTo = assignmentData?.assignment?.assigned_to;

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [showLeftPanel, showRightPanel]);

  useLayoutEffect(() => {
    let toolGroup = ToolGroupManager.createToolGroup("toolGroup2d");
    setToolGroup(toolGroup);

    return () => {
      ToolGroupManager.destroyToolGroup("toolGroup2d");
    };
  }, [seriesUid]);

  useLayoutEffect(() => {
    if (!seriesUid) return; // nothing to load until a series is selected
    const requestId = ++loadRequestRef.current;
    let isCancelled = false;

    const initialize = async () => {
      const files = await getQCSeriesFiles(assignmentId, seriesUid);
      if (isCancelled || requestId !== loadRequestRef.current) return;

      setImageIds(buildSeriesImageIds(files));
      setFileByUrl(buildFileByUrlMap(files));

      dispatch(setTitle("QC Review"));
      dispatch(reset());
      dispatch(setQCConfig());
      dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
      dispatch(
        setOption({
          key: "leftClick",
          value: Enums.LeftClickOptions.WINDOW_LEVEL,
        }),
      );
      dispatch(
        setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }),
      );

      setIsInitialized(true);
      dispatch(setLoading(false));
    };

    initialize().catch((error) => {
      if (isCancelled || requestId !== loadRequestRef.current) return;
      console.error(error);
      notify.error(error, messages.errors.loadImage);
      setIsErrored(true);
      dispatch(setLoading(false));
    });

    return () => {
      isCancelled = true;
      setIsInitialized(false);
      setIsErrored(false);
    };
  }, [assignmentId, seriesUid, dispatch]);

  // Clear the note when moving to another series
  useEffect(() => {
    setNote("");
  }, [seriesUid]);

  useHotkeys("a", () => handleQCAction("approved"));
  useHotkeys("r", () => handleQCAction("rejected"));
  useHotkeys("f", () => handleQCAction("flagged"));
  useHotkeys("tab", onNext);
  useHotkeys("right", onNext);
  useHotkeys("left", onPrevious);

  async function handleQCAction(action) {
    const config = QC_ACTIONS[action];
    if (!config) {
      console.warn("Unknown QC action:", action);
      return;
    }
    if (readOnly) {
      if (assignedTo != null) {
        notify.info(messages.qc.readOnly(assignedTo));
      }
      return;
    }

    const trimmedNote = note.trim();
    if (config.noteRequired && !trimmedNote) {
      notify.info(messages.qc.noteRequired(action));
      noteInputRef.current?.focus();
      return;
    }

    try {
      await setQCSeriesStatus(assignmentId, seriesUid, action, trimmedNote);
      notify.success(messages.qc.statusSet(action));
      setNote("");
      onStatusChanged();
      onNext();
    } catch (error) {
      notify.error(error, messages.errors.saveStatus);
    }
  }

  const topStrip = (
    <div id="qc-top-strip">
      <QCFilterPanel
        qcStatus={qcStatus}
        modality={modality}
        modalityOptions={modalityOptions}
        onAction={onFilter}
      />
      <QCProgressHeader seriesByStatus={assignmentData?.series_by_status} />
    </div>
  );

  const leftPanel = (
    <>
      <NavigationPanel
        onNext={onNext}
        onPrevious={onPrevious}
        currentId={seriesUid}
        idLabel="Series"
      />
      {toolGroup && <ToolsPanel toolGroup={toolGroup} />}
    </>
  );

  const rightPanel = (
    <>
      <QCOperationsPanel
        series={series}
        readOnly={readOnly}
        assignedTo={assignedTo}
        note={note}
        onNoteChange={setNote}
        noteInputRef={noteInputRef}
        onAction={handleQCAction}
      />
      <QCDicomDump fileByUrl={fileByUrl} />
    </>
  );

  // Load failures are surfaced as a toast; keep the viewport itself clean
  // with a neutral placeholder rather than an error card.
  if (isErrored) {
    return <ViewportPlaceholder />;
  }

  // No series selected yet (redirect pending, or the filters matched nothing)
  if (!seriesUid) {
    return (
      <RouteLayout
        routeName={routeName}
        leftPanel={leftPanel}
        middlePanel={
          <>
            {topStrip}
            <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300">
              {noSeries ? messages.qc.noSeries : ""}
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

  return (
    <RouteLayout
      routeName={routeName}
      leftPanel={leftPanel}
      middlePanel={
        <>
          {topStrip}
          <StackView toolGroup={toolGroup} frames={imageIds} />
          <CineControls key={seriesUid} />
        </>
      }
      rightPanel={rightPanel}
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
