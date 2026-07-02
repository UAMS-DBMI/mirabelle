/**
 * This is the true entrypoint of the program.
 */
console.log("Current commit:", __COMMIT_HASH__);

import React from "react";
import ReactDOM from "react-dom/client";

import store from "./store";
import { Provider } from "react-redux";

import installGlobalErrorHandlers from "@/lib/installGlobalErrorHandlers";

import EnableCornerstone from "@/components/EnableCornerstone";
import LoadingOverlay from "@/components/LoadingOverlay";

import { createBrowserRouter, RouterProvider } from "react-router-dom";

import AppLayout from "@/components/AppLayout";

import ErrorPage from "./error-page";
import "./index.css";

import LoadingSpinner from "@/components/LoadingSpinner";

import Home from "./routes/home";

import RouteMaskIEC, {
  loader as routeMaskIECLoader,
} from "./routes/mask/RouteMaskIEC";

import RouteMaskReviewIEC, {
  loader as routeMaskReviewIECLoader,
} from "./routes/mask-review/RouteMaskReviewIEC";

import RouteMaskReviewVR, {
  loader as routeMaskerReviewVRLoader,
} from "./routes/mask-review/RouteMaskReviewVR";

import RouteDicomReviewVR, {
  loader as routeDicomReviewVRLoader,
} from "./routes/dicom/RouteDicomReviewVR";

import RouteDicomReviewIEC, {
  loader as routeDicomReviewIECLoader,
} from "./routes/dicom/RouteDicomReviewIEC";

import RouteMaskVR, {
  loader as routeMaskVRLoader,
} from "./routes/mask/RouteMaskVR";

import RouteNiftiReviewFile, {
  loader as routeNiftiReviewFileLoader,
} from "./routes/nifti/RouteNiftiReviewFile";

import RouteNiftiReviewVR, {
  loader as routeNiftiReviewVRLoader,
} from "./routes/nifti/RouteNiftiReviewVR";

import RouteQCAssignment from "./routes/qc/RouteQCAssignment";

import RouteDump, { loader as routeDumpLoader } from "./routes/dicom/RouteDump";

import RouteTests from "@/components/RouteTests";

import RouteMessagesPlayground from "./routes/dev/RouteMessagesPlayground";

const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      errorElement: <ErrorPage />,
      children: [
        {
          path: "/",
          // element: <Home />,
          Component: Home,
          HydrateFallback: LoadingSpinner,
          errorElement: <ErrorPage />,
        },
        // Mask Routes
        // ----------------------------------
        {
          path: "mask/iec/:iec",
          element: <RouteMaskIEC />,
          HydrateFallback: LoadingSpinner,
          loader: routeMaskIECLoader,
        },
        {
          path: "mask/vr/:vr",
          element: <RouteMaskVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "mask/vr/:vr/:iec",
          element: <RouteMaskVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "mask/vr/:vr/:iec/:maskingStatus",
          element: <RouteMaskVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "mask/vr/:vr/:iec/:maskingStatus/:dicomType",
          element: <RouteMaskVR />,
          HydrateFallback: LoadingSpinner,
        },
        // Mask Review Routes
        // ----------------------------------
        {
          path: "mask/review/iec/:iec",
          element: <RouteMaskReviewIEC />,
          HydrateFallback: LoadingSpinner,
          loader: routeMaskReviewIECLoader,
        },
        {
          path: "mask/review/vr/:vr",
          element: <RouteMaskReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "mask/review/vr/:vr/:iec",
          element: <RouteMaskReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "mask/review/vr/:vr/:iec/:maskingStatus",
          element: <RouteMaskReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "mask/review/vr/:vr/:iec/:maskingStatus/:dicomType",
          element: <RouteMaskReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        // Nifti Review Routes
        // ----------------------------------
        {
          path: "review/nifti/file/:file",
          element: <RouteNiftiReviewFile />,
          HydrateFallback: LoadingSpinner,
          loader: routeNiftiReviewFileLoader,
        },
        {
          path: "review/nifti/vr/:vr",
          element: <RouteNiftiReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "review/nifti/vr/:vr/:file",
          element: <RouteNiftiReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "review/nifti/vr/:vr/:file/:reviewStatus",
          element: <RouteNiftiReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        // Dicom Review Routes
        // ----------------------------------
        {
          path: "review/dicom/iec/:iec",
          element: <RouteDicomReviewIEC />,
          HydrateFallback: LoadingSpinner,
          loader: routeDicomReviewIECLoader,
        },
        {
          path: "review/dicom/vr/:vr",
          element: <RouteDicomReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "review/dicom/vr/:vr/:iec",
          element: <RouteDicomReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "review/dicom/vr/:vr/:iec/:reviewStatus/:dicomType",
          element: <RouteDicomReviewVR />,
          HydrateFallback: LoadingSpinner,
        },
        // QC Routes
        // ----------------------------------
        {
          path: "qc/assignments/:assignmentId",
          element: <RouteQCAssignment />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "qc/assignments/:assignmentId/:seriesUid",
          element: <RouteQCAssignment />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "qc/assignments/:assignmentId/:seriesUid/:qcStatus/:modality",
          element: <RouteQCAssignment />,
          HydrateFallback: LoadingSpinner,
        },
        // Other Routes
        // ----------------------------------
        {
          path: "dump/:file_id",
          element: <RouteDump />,
          HydrateFallback: LoadingSpinner,
          loader: routeDumpLoader,
        },
        {
          path: "test/:vr/:file_id",
          element: <RouteTests />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "test/:vr",
          element: <RouteTests />,
          HydrateFallback: LoadingSpinner,
        },
        {
          path: "dev/messages",
          element: <RouteMessagesPlayground />,
          HydrateFallback: LoadingSpinner,
        },
      ],
    },
  ],
  {
    basename: "/mira",
  },
);

const root = ReactDOM.createRoot(document.getElementById("root"));

// Catch errors that escape component-level handling (e.g. async failures deep
// in Cornerstone) and surface them as toasts instead of raw runtime errors.
installGlobalErrorHandlers();

if (
  typeof navigator !== "undefined" &&
  navigator.userAgent.includes("Windows")
) {
  document.documentElement.classList.add("windows");
}

root.render(
  <Provider store={store}>
    <EnableCornerstone>
      <LoadingOverlay>
        <RouterProvider router={router} />
      </LoadingOverlay>
    </EnableCornerstone>
  </Provider>,
);
