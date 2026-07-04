import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";

import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";
import { getQCAssignment, getQCAssignmentSeries } from "@/qc";
import { getCurrentUser } from "@/utilities";
import { resetOptions, setLoading } from "@/features/optionSlice";
import QCAssignment from "@/features/qc/QCAssignment";

function seriesPath(assignmentId, seriesUid, qcStatus, modality) {
  return [
    "/qc",
    "assignments",
    assignmentId,
    seriesUid,
    qcStatus,
    modality,
  ].join("/");
}

// Sentinel :seriesUid for the end-of-list screen, reached by deciding the
// last series. Can't collide with a real series UID (those are digits/dots).
const END_SENTINEL = "end";

/**
 * QC route: opens directly to an assignment (already claimed elsewhere) and
 * walks its series list. The selected series and the qc_status/modality
 * filters live in the URL so navigation is back/forward-friendly.
 */
export default function RouteQCAssignment() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    assignmentId,
    seriesUid,
    qcStatus: rawQcStatus,
    modality: rawModality,
  } = useParams();
  const qcStatus = rawQcStatus || "All";
  const modality = rawModality || "All";

  const [assignmentData, setAssignmentData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [seriesList, setSeriesList] = useState(null);

  // Assignment rollups drive the progress header; refresh after each status
  // change so the counts stay current.
  const refreshAssignment = useCallback(() => {
    getQCAssignment(assignmentId)
      .then(setAssignmentData)
      .catch((error) => {
        notify.error(error, messages.qc.assignmentLoadFailed);
      });
  }, [assignmentId]);

  useEffect(() => {
    setAssignmentData(null);
    refreshAssignment();
  }, [refreshAssignment]);

  // The route is read-only unless the current user owns the assignment.
  useEffect(() => {
    getCurrentUser()
      .then(setCurrentUser)
      .catch((error) => {
        // Ownership can't be verified, so QC actions stay disabled.
        console.error("Failed to fetch current user:", error);
      });
  }, []);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(setLoading(true));
    // Clear stale list to avoid redirecting with previous results
    setSeriesList(null);

    getQCAssignmentSeries(assignmentId, { qcStatus, modality })
      .then((series) => {
        setSeriesList(series);
        if (Array.isArray(series) && series.length === 0) {
          // No results: stop loading and notify
          dispatch(setLoading(false));
          notify.info(messages.filters.noResults);
          return;
        }
        // End-of-list screen: nothing loads, so stop the spinner here
        if (seriesUid === END_SENTINEL) {
          dispatch(setLoading(false));
          return;
        }
        // If the series isn't specified (or is '*'), redirect to the FIRST
        // series from these fresh results
        if ((seriesUid === "*" || !seriesUid) && series.length > 0) {
          navigate(
            seriesPath(
              assignmentId,
              series[0].series_instance_uid,
              qcStatus,
              modality,
            ),
            { replace: true },
          );
        }
      })
      .catch((error) => {
        setSeriesList([]);
        dispatch(setLoading(false));
        notify.error(error, messages.filters.loadFailed);
      });
  }, [assignmentId, qcStatus, modality, seriesUid, dispatch, navigate]);

  const atEnd = seriesUid === END_SENTINEL;

  // Calculate the next and previous series from the fetched list
  let nextUid = null;
  let previousUid = null;
  let offset = -1;

  if (seriesList && atEnd && seriesList.length > 0) {
    // From the end screen, Back returns to the last series of the list
    previousUid = seriesList[seriesList.length - 1].series_instance_uid;
  } else if (seriesList && seriesUid && seriesUid !== "*") {
    offset = seriesList.findIndex((s) => s.series_instance_uid === seriesUid);
    const nextOffset = offset + 1;
    const previousOffset = offset - 1;

    if (nextOffset >= 0 && nextOffset < seriesList.length) {
      nextUid = seriesList[nextOffset].series_instance_uid;
    }
    if (previousOffset >= 0 && previousOffset < seriesList.length) {
      previousUid = seriesList[previousOffset].series_instance_uid;
    }
  }

  const handleNext = () => {
    if (nextUid) {
      navigate(seriesPath(assignmentId, nextUid, qcStatus, modality));
    } else {
      notify.info(messages.navigation.noNext("series"));
    }
  };

  const handlePrevious = () => {
    if (previousUid) {
      navigate(seriesPath(assignmentId, previousUid, qcStatus, modality));
    } else {
      notify.info(messages.navigation.noPrevious("series"));
    }
  };

  // After a QC decision: advance to the next series, or to the end-of-list
  // screen when the last series was just decided (staying put would show
  // stale status data).
  const handleActionAdvance = () => {
    const target = nextUid || END_SENTINEL;
    navigate(seriesPath(assignmentId, target, qcStatus, modality));
  };

  const handleFilter = ({ qcStatus: newStatus, modality: newModality }) => {
    navigate(
      seriesPath(assignmentId, "*", newStatus || "All", newModality || "All"),
    );
  };

  const modalityOptions = [
    "All",
    ...[
      ...new Set(
        (assignmentData?.series_by_modality || []).map((row) => row.modality),
      ),
    ].sort(),
  ];

  const assignedTo = assignmentData?.assignment?.assigned_to;
  const readOnly = !(
    currentUser &&
    assignedTo != null &&
    currentUser.user_id === assignedTo
  );

  const resolvedSeriesUid =
    seriesUid && seriesUid !== "*" && !atEnd ? seriesUid : null;
  const noSeries = Array.isArray(seriesList) && seriesList.length === 0;
  const currentSeries =
    (resolvedSeriesUid &&
      seriesList?.find((s) => s.series_instance_uid === resolvedSeriesUid)) ||
    null;

  return (
    <QCAssignment
      assignmentId={assignmentId}
      seriesUid={resolvedSeriesUid}
      series={currentSeries}
      assignmentData={assignmentData}
      readOnly={readOnly}
      noSeries={noSeries}
      atEnd={atEnd}
      qcStatus={qcStatus}
      modality={modality}
      modalityOptions={modalityOptions}
      seriesPosition={offset >= 0 ? offset + 1 : null}
      seriesCount={seriesList?.length ?? null}
      hasNext={nextUid != null}
      hasPrevious={previousUid != null}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onActionAdvance={handleActionAdvance}
      onFilter={handleFilter}
      onStatusChanged={refreshAssignment}
    />
  );
}
