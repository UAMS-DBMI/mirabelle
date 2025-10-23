import React from "react";

import { useState, useContext } from 'react';
import { useSelector } from 'react-redux';

import "./FilterPanel.css";



function FilterPanel() {
  const filterConfig = useSelector(state => state.presentation.filterConfig);

  return (
    <div id="filter-panel">

      {filterConfig.visibility.type && (        
        <label>
          <span>Type:</span>
          <select id="filter-type">
            <option>DICOM</option>
            <option>NIFTI</option>
          </select>
        </label>
      )}

      {filterConfig.visibility.vr && (
        <label>
          <span>VR:</span>
          <input
            id="filter-vr"
            type="text"
            placeholder="VR"
            maxLength="4"
            size="10"
          />
        </label>
      )}

      {filterConfig.visibility.iec && (        
        <label>
          <span>IEC:</span>
          <input
            id="filter-iec"
            type="text"
            placeholder="IEC"
            maxLength="8"
            size="10"
          />
        </label>
      )}      

      {filterConfig.visibility.file && (        
        <label>
          <span>File:</span>
          <input
            id="filter-file"
            type="text"
            placeholder="File"
            maxLength="8"
            size="10"
          />
        </label>
      )}      

      {filterConfig.visibility.series && (        
        <label>
          <span>Series:</span>
          <input
            id="filter-series"
            type="text"
            placeholder="Series"
            size="50"
          />
        </label>
      )}      

      {filterConfig.visibility.timepoint && (        
        <label>
          <span>Timepoint:</span>
          <input
            id="filter-timepoint"
            type="text"
            placeholder="Timepoint"
            maxLength="4"
            size="10"
          />
        </label>
      )} 

      {filterConfig.visibility.maskingStatus && (      
        <label>
          <span>Masking Status:</span>
          <select id="filter-masking-status">
            <option>ALL</option>
          </select>
        </label>
      )}       

      {filterConfig.visibility.reviewStatus && (      
        <label>
          <span>Review Status:</span>
          <select id="filter-review-status">
            <option>ALL</option>
            <option>Good</option>
            <option>Bad</option>
            <option>Blank</option>
            <option>Scout</option>
            <option>Other</option>
            <option>Flagged</option>
          </select>
        </label>
      )}      

      {filterConfig.visibility.processingStatus && (
        <label>
          <span>Processing Status:</span>
          <select id="filter-processing-status">
            <option>ALL</option>
          </select>
        </label>
      )}

      {filterConfig.visibility.dicomType && (
        <label>
          <span>Dicom Type:</span>
          <select id="filter-dicom-type">
            <option>ALL</option>
          </select>
        </label>        
      )}      


      {/* Nifti Review Filters */}


      {/* Search Filters */}
     
      
     

      <button>Filter</button>
    </div>
  );
}



//   return (
//     <div
//       id="searchPanel"
//       className="flex gap-2 w-full rounded-lg justify-center"
//     >
//       <label className="flex items-center space-x-1">
//         {/*<span>Type:</span>*/}
//         <select className="rounded-md border border-gray-300 h-8 px-2">
//           <option>DICOM</option>
//           <option>NIFTI</option>
//         </select>
//       </label>
//       <label className="flex items-center space-x-1">
//         {/*<span>File ID:</span>*/}
//         <input
//           type="text"
//           placeholder="File ID"
//           maxLength="8"
//           size="10"
//           className="rounded-md border border-gray-300 h-8 px-2"
//         />
//       </label>
//       <label className="flex items-center space-x-1">
//         {/*<span>Series Instance UID:</span>*/}
//         <input
//           type="text"
//           placeholder="Series Instance UID"
//           size="50"
//           className="rounded-md border border-gray-300 h-8 px-2"
//         />
//       </label>
//       <label className="flex items-center space-x-1">
//         {/*<span>Timepoint ID:</span>*/}
//         <input
//           type="text"
//           placeholder="Timepoint ID"
//           maxLength="4"
//           size="13"
//           className="rounded-md border border-gray-300 h-8 px-2"
//         />
//       </label>
//       <button className="bg-blue-500 text-white rounded-md px-4 h-8 flex items-center justify-center">
//         Search
//       </button>
//     </div>
//   );
// }

export default FilterPanel;
