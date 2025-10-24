import React from "react";

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { getValuesForDicomVR } from '@/utilities';

import "./FilterPanel.css";

function FilterPanel({ 
  type: initialType,
  vr: initialVr, 
  iec: initialIec, 
  file: initialFile, 
  series: initialSeries, 
  timepoint: initialTimepoint, 
  maskingStatus: initialMaskingStatus, 
  reviewStatus: initialReviewStatus, 
  processingStatus: initialProcessingStatus,
  dicomType: initialDicomType, 
  dicomTypeOptions: providedDicomTypeOptions,
  onAction 
}) {
  const filterConfig = useSelector(state => state.presentation.filterConfig);

  // Local state for all supported fields (only visible ones will render)
  const [type, setType] = useState(initialType || "All");
  const [vr, setVr] = useState(initialVr || "");
  const [iec, setIec] = useState(initialIec || "");
  const [file, setFile] = useState(initialFile || "");
  const [series, setSeries] = useState(initialSeries || "");
  const [timepoint, setTimepoint] = useState(initialTimepoint || "");
  const [maskingStatus, setMaskingStatus] = useState(initialMaskingStatus || "All");
  const [reviewStatus, setReviewStatus] = useState(initialReviewStatus || "All");
  const [processingStatus, setProcessingStatus] = useState(initialProcessingStatus || "All");
  const [dicomType, setDicomType] = useState(initialDicomType || "All");
  const [dicomTypeOptions, setDicomTypeOptions] = useState(["All"]);

  // Keep state in sync if route props change
  useEffect(() => {
    setType(initialType || "All");
  }, [initialType]);  
  useEffect(() => {
    setVr(initialVr || "");
  }, [initialVr]);
  useEffect(() => {
    setIec(initialIec || "");
  }, [initialIec]);
  useEffect(() => {
    setFile(initialFile || "");
  }, [initialFile]);
  useEffect(() => {
    setSeries(initialSeries || "");
  }, [initialSeries]);
  useEffect(() => {
    setTimepoint(initialTimepoint || "");
  }, [initialTimepoint]);
  useEffect(() => {
    setMaskingStatus(initialMaskingStatus || "All");
  }, [initialMaskingStatus]);
  useEffect(() => {
    setReviewStatus(initialReviewStatus || "All");
  }, [initialReviewStatus]);
  useEffect(() => {
    setProcessingStatus(initialProcessingStatus || "All");
  }, [initialProcessingStatus]);
  useEffect(() => {
    setDicomType(initialDicomType || "All");
  }, [initialDicomType]);

  // Prefer provided options when available; otherwise fetch
  useEffect(() => {
    if (Array.isArray(providedDicomTypeOptions) && providedDicomTypeOptions.length) {
      setDicomTypeOptions(providedDicomTypeOptions);
      return;
    }
    const vrId = initialVr;
    if (!vrId) {
      setDicomTypeOptions(["All"]);
      return;
    }
    getValuesForDicomVR(vrId)
      .then((values) => {
        const list = Array.from(
          new Set(
            (values?.dicom_file_types || [])
              .map((it) => it?.dicom_file_type)
              .filter(Boolean)
          )
        );
        const opts = ["All", ...list];
        if (dicomType && dicomType !== 'All' && !opts.includes(dicomType)) {
          opts.splice(1, 0, dicomType);
        }
        setDicomTypeOptions(opts);
      })
      .catch(() => {
        setDicomTypeOptions(["All"]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVr, providedDicomTypeOptions]);


  const submitOnEnter = (e) => {
    if (e.key === "Enter") handleFilter();
  };

  const handleFilter = () => {
    if (!onAction) return;

    // Build payload using only visible fields
    const vis = (filterConfig && filterConfig.visibility) || {};
    const values = {
      type,
      vr,
      iec,
      file,
      series,
      timepoint,
      maskingStatus,
      reviewStatus,
      processingStatus,
      dicomType,
    };

    const payload = Object.keys(vis).reduce((acc, key) => {
      if (vis[key]) acc[key] = values[key];
      return acc;
    }, {});

    onAction(payload);
  };

  const visibility = (filterConfig && filterConfig.visibility) || {};

  return (
    <div id="filter-panel">

      {visibility.type && (        
        <label>
          <span>Type:</span>
          <select 
            id="filter-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            onKeyDown={submitOnEnter}            
          >
            <option>All</option>
            <option>DICOM</option>
            <option>NIFTI</option>
          </select>
        </label>
      )}

      {visibility.vr && (
        <label>
          <span>VR:</span>
          <input
            id="filter-vr"
            type="text"
            placeholder="VR"
            maxLength="4"
            size="10"
            value={vr}
            onChange={(e) => setVr(e.target.value)}
            onKeyDown={submitOnEnter}            
          />
        </label>
      )}

      {visibility.iec && (        
        <label>
          <span>IEC:</span>
          <input
            id="filter-iec"
            type="text"
            placeholder="IEC"
            maxLength="8"
            size="10"
            value={iec}
            onChange={(e) => setIec(e.target.value)}
            onKeyDown={submitOnEnter}            
          />
        </label>
      )}      

      {visibility.file && (        
        <label>
          <span>File:</span>
          <input
            id="filter-file"
            type="text"
            placeholder="File"
            maxLength="8"
            size="10"
            value={file}
            onChange={(e) => setFile(e.target.value)}
            onKeyDown={submitOnEnter}            
          />
        </label>
      )}      

      {visibility.series && (        
        <label>
          <span>Series:</span>
          <input
            id="filter-series"
            type="text"
            placeholder="Series"
            size="50"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            onKeyDown={submitOnEnter}            
          />
        </label>
      )}      

      {visibility.timepoint && (        
        <label>
          <span>Timepoint:</span>
          <input
            id="filter-timepoint"
            type="text"
            placeholder="Timepoint"
            maxLength="4"
            size="10"
            value={timepoint}
            onChange={(e) => setTimepoint(e.target.value)}
            onKeyDown={submitOnEnter}            
          />
        </label>
      )} 

      {visibility.maskingStatus && (      
        <label>
          <span>Masking Status:</span>
          <select 
            id="filter-masking-status"
            value={maskingStatus}
            onChange={(e) => setMaskingStatus(e.target.value)}
            onKeyDown={submitOnEnter}
          >
            <option>All</option>
          </select>
        </label>
      )}       

      {visibility.reviewStatus && (      
        <label>
          <span>Review Status:</span>
          <select 
            id="filter-review-status"
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value)}
            onKeyDown={submitOnEnter}
          >
            <option>All</option>
            <option>Unreviewed</option>
            <option>Good</option>
            <option>Bad</option>
            <option>Blank</option>
            <option>Scout</option>
            <option>Other</option>
            <option>Flagged</option>
          </select>
        </label>
      )}      

      {visibility.processingStatus && (
        <label>
          <span>Processing Status:</span>
          <select 
            id="filter-processing-status"
            value={processingStatus}
            onChange={(e) => setProcessingStatus(e.target.value)}
            onKeyDown={submitOnEnter}
          >
            <option>All</option>
          </select>
        </label>
      )}

      {visibility.dicomType && (
        <label>
          <span>Dicom Type:</span>
          <select 
            id="filter-dicom-type"
            value={dicomType}
            onChange={(e) => setDicomType(e.target.value)}
            onKeyDown={submitOnEnter}
          >
            {dicomTypeOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>        
      )}      

      <button onClick={handleFilter}>Filter</button>
    </div>
  );
}

export default FilterPanel;
