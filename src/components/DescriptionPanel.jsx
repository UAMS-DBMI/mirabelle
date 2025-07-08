import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { Context } from "./Context.js";

function DescriptionPanel({ details }) {
  const { nifti, layout } = useContext(Context);

  function downloadFile() {
    // Fetch the file from the path specified in details["path"]
    fetch(details["download_path"])
      .then((response) => response.blob()) // Convert the response to a blob
      .then((blob) => {
        const element = document.createElement("a");
        const url = URL.createObjectURL(blob);
        element.href = url;
        element.target = "_blank";
        element.download = details["import_name"];
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element); // Clean up after download
        URL.revokeObjectURL(url); // Free up memory
      })
      .catch((error) => console.error("Error downloading file:", error));
  }

  function downloadIEC() {
    // Fetch the file from the path specified in details["path"]

    const iec = details["image_equivalence_class_id"];

    let download_path = details["download_path"];
    if (layout == "MaskerReview") {
      download_path = `/papi/v1/masking/${iec}/reviewfiles/download`;
    }

    const link = document.createElement("a");
    link.href = download_path;
    link.target = "_blank";
    link.download = details["download_name"];
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (nifti) {
    return (
      <div
        id="descriptionPanel"
        className="h-full overflow-auto p-6 rounded-lg bg-blue-100 dark:bg-blue-900"
      >
        {/*<div className="w-full mb-2 font-bold">Description:</div>*/}
        <hr className="border-t border-gray-300 mb-4" />
        <button
          id="downloadFile"
          onClick={downloadFile}
          className="text-white bg-green-700 hover:bg-green-800 mb-4"
        >
          Download File
        </button>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Import File Name:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["import_name"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Import File Path:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["import_path"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Posda File Path:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["posda_path"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />
      </div>
    );
  } else {
    return (
      <div
        id="descriptionPanel"
        className="h-full overflow-hidden p-6 rounded-lg bg-blue-100 dark:bg-blue-900"
      >
        <hr className="border-t border-gray-300 mb-4" />
        <button
          id="downloadIEC"
          onClick={downloadIEC}
          className="text-white bg-green-700 hover:bg-green-800 mb-4"
        >
          Download IEC
        </button>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">IEC:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["image_equivalence_class_id"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Images in IEC:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["file_count"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Processing Status:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["processing_status"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Review Status:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["review_status"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Body Part Examined:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["body_part_examined"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Patient ID:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["patient_id"]}
        </div>

        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Series Instance UID:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["series_instance_uid"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />
        <div className="w-full mb-2 font-bold">Series Description:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["series_description"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />

        <div className="w-full mb-2 font-bold">Path:</div>
        <div className="w-full mb-2 font-normal break-words mb-4">
          {details["path"]}
        </div>
        <hr className="border-t border-gray-300 mb-4" />


        {/*<div className="w-full mb-2 font-semibold">Description</div>*/}
        {/*<div className="w-full h-full overflow-y-scroll no-scrollbars pb-8">Heres a 4-sentence random description about the current selection or feature being reviewed, description about the current selection or feature being reviewed, description about the current selection random description about the current selection or feature being reviewed, description about the current selection or feature being reviewed, description about the current selection or feature being reviewed, providing context or additional information as required.</div>*/}
      </div>
    );
  }
}

export default DescriptionPanel;
