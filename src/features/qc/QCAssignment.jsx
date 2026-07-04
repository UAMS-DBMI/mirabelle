import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHotkeys } from "react-hotkeys-hook";

import * as cornerstoneTools from "@cornerstonejs/tools";

import { setTitle, setLoading } from "@/features/optionSlice";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";
import {
  getQCSeriesFiles,
  setQCSeriesStatus,
  buildSeriesImageIds,
  buildFileByUrlMap,
} from "@/qc";

import QCStudyHeader from "./QCStudyHeader";
import QCNavBar from "./QCNavBar";
import QCViewerToolbar from "./QCViewerToolbar";
import QCViewport from "./QCViewport";
import QCOperationsPanel from "./QCOperationsPanel";
import QCDicomDump from "./QCDicomDump";
import CineControls from "./CineControls";
import useCurrentDataSet from "./useCurrentDataSet";
import useViewportInfo from "./useViewportInfo";
import { buildStudyInfo } from "./dicomText";
import { getQCViewport } from "./viewport";

import "./QCAssignment.css";

const {
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

// Server-accepted qc_status values and their note rules.
const QC_ACTIONS = {
  approved: { noteRequired: false },
  rejected: { noteRequired: true },
  flagged: { noteRequired: true },
};

const ZOOM_STEP = 1.2;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5;

/**
 * The QC page for one series of an assignment, laid out per the
 * "DICOM Stack Reviewer" design: study header, assignment nav/progress bar,
 * stack viewer with cine, and a right panel with the review actions and a
 * client-side DICOM dump following the displayed frame. Intentionally a
 * standalone light-themed layout — it does not use the app's RouteLayout
 * panel system.
 */
export default function QCAssignment({
  assignmentId,
  seriesUid,
  series,
  assignmentData,
  readOnly,
  noSeries,
  atEnd,
  qcStatus,
  modality,
  modalityOptions,
  seriesPosition,
  seriesCount,
  hasNext,
  hasPrevious,
  onNext = () => {},
  onPrevious = () => {},
  onActionAdvance = () => {},
  onFilter = () => {},
  onStatusChanged = () => {},
}) {
  const dispatch = useDispatch();

  const [toolGroup, setToolGroup] = useState();
  const [imageIds, setImageIds] = useState();
  const [fileByUrl, setFileByUrl] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);
  const [note, setNote] = useState("");
  const [activeTool, setActiveTool] = useState("wl");
  const noteInputRef = useRef(null);
  const loadRequestRef = useRef(0);

  const assignedTo = assignmentData?.assignment?.assigned_to;

  const currentImageId = useSelector((state) => state.options.currentImageId);
  const { dataSet } = useCurrentDataSet();
  const studyInfo = useMemo(() => buildStudyInfo(dataSet), [dataSet]);
  const viewportInfo = useViewportInfo(currentImageId);

  const frameCount = imageIds?.length ?? 0;
  const frameIndex =
    imageIds && currentImageId ? imageIds.indexOf(currentImageId) : -1;

  useLayoutEffect(() => {
    let toolGroup = ToolGroupManager.createToolGroup("toolGroup2d");
    setToolGroup(toolGroup);

    return () => {
      ToolGroupManager.destroyToolGroup("toolGroup2d");
    };
  }, [seriesUid]);

  // Static tool bindings: wheel scrolls the stack, right-drag zooms.
  // (addTool is a no-op for tools that are already registered globally.)
  useEffect(() => {
    if (!toolGroup) return;
    cornerstoneTools.addTool(WindowLevelTool);
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(ZoomTool);
    cornerstoneTools.addTool(StackScrollTool);

    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);

    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Wheel }],
    });
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
    });
  }, [toolGroup]);

  // Left-drag follows the toolbar's Window/Level ↔ Pan toggle.
  useEffect(() => {
    if (!toolGroup) return;
    const primary = activeTool === "pan" ? PanTool : WindowLevelTool;
    const inactive = activeTool === "pan" ? WindowLevelTool : PanTool;
    toolGroup.setToolDisabled(inactive.toolName);
    toolGroup.setToolActive(primary.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  }, [toolGroup, activeTool]);

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

  // Start each series from its saved note so it can be reviewed or edited.
  const savedNotes = series?.notes ?? "";
  useEffect(() => {
    setNote(savedNotes);
  }, [seriesUid, savedNotes]);

  function zoomBy(factor) {
    const viewport = getQCViewport();
    if (!viewport) return;
    const zoom = Math.min(
      Math.max(viewport.getZoom() * factor, MIN_ZOOM),
      MAX_ZOOM,
    );
    viewport.setZoom(zoom);
    viewport.render();
  }

  function resetView() {
    const viewport = getQCViewport();
    if (!viewport) return;
    viewport.resetCamera();
    viewport.resetProperties();
    viewport.render();
  }

  useHotkeys("a", () => handleQCAction("approved"));
  useHotkeys("r", () => handleQCAction("rejected"));
  useHotkeys("f", () => handleQCAction("flagged"));
  useHotkeys("tab", onNext, { preventDefault: true });
  useHotkeys("shift+tab", onPrevious, { preventDefault: true });
  useHotkeys("equal, shift+equal", () => zoomBy(ZOOM_STEP), {
    preventDefault: true,
  });
  useHotkeys("minus", () => zoomBy(1 / ZOOM_STEP), { preventDefault: true });

  async function handleQCAction(action) {
    const config = QC_ACTIONS[action];
    if (!config || !seriesUid) {
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
      // Buttons are disabled without a note, but the hotkeys still land here.
      notify.info(messages.qc.noteRequired(action));
      noteInputRef.current?.focus();
      return;
    }

    try {
      await setQCSeriesStatus(assignmentId, seriesUid, action, trimmedNote);
      notify.success(messages.qc.statusSet(action));
      setNote("");
      onStatusChanged();
      onActionAdvance();
    } catch (error) {
      notify.error(error, messages.errors.saveStatus);
    }
  }

  function page(centerContent, rightContent) {
    return (
      <div id="qc-page">
        <QCStudyHeader studyInfo={studyInfo} series={series} />
        <QCNavBar
          position={seriesPosition}
          total={seriesCount}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onPrevious={onPrevious}
          onNext={onNext}
          qcStatus={qcStatus}
          modality={modality}
          modalityOptions={modalityOptions}
          onFilter={onFilter}
          seriesByStatus={assignmentData?.series_by_status}
        />
        <div id="qc-main">
          <div id="qc-center">{centerContent}</div>
          <div id="qc-right-panel">{rightContent}</div>
        </div>
      </div>
    );
  }

  // No series selected: end-of-list screen, pending redirect, or the
  // filters matched nothing.
  if (!seriesUid) {
    let emptyMessage = "";
    if (atEnd) {
      emptyMessage = messages.qc.endReached;
    } else if (noSeries) {
      emptyMessage = messages.qc.noSeries;
    }
    return page(
      <div className="qc-empty-viewport">{emptyMessage}</div>,
      <QCDicomDump fileByUrl={{}} frameIndex={-1} frameCount={0} />,
    );
  }

  // Load failures are surfaced as a toast; keep the viewport area neutral.
  if (isErrored) {
    return page(
      <div className="qc-empty-viewport">{messages.viewport.noImage}</div>,
      <QCDicomDump fileByUrl={{}} frameIndex={-1} frameCount={0} />,
    );
  }

  if (!isInitialized) {
    return null;
  }

  return page(
    <>
      <QCViewerToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        zoom={viewportInfo.zoom}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onResetView={resetView}
      />
      <QCViewport
        frames={imageIds}
        toolGroup={toolGroup}
        studyInfo={studyInfo}
        viewportInfo={viewportInfo}
        frameIndex={frameIndex}
        frameCount={frameCount}
      />
      <CineControls
        key={seriesUid}
        frameIndex={frameIndex}
        frameCount={frameCount}
      />
    </>,
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
      <QCDicomDump
        fileByUrl={fileByUrl}
        frameIndex={frameIndex}
        frameCount={frameCount}
      />
    </>,
  );
}
