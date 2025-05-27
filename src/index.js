/**
 * This is the true entrypoint of the program.
 */

import React from "react";
import ReactDOM from "react-dom/client";

import store from "./store";
import { Provider } from "react-redux";

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

import RouteDump, {
  loader as routeDumpLoader,
} from "./routes/dicom/RouteDump";

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
        {
          path: "mask/iec/:iec",
          element: <RouteMaskIEC />,
          HydrateFallback: LoadingSpinner,
          loader: routeMaskIECLoader,
        },
        {
          path: "mask/vr/:visual_review_instance_id",
          element: <RouteMaskVR />,
          HydrateFallback: LoadingSpinner,
          loader: routeMaskVRLoader,
          errorElement: <ErrorPage />,
        },
        {
          path: "mask/review/iec/:iec",
          element: <RouteMaskReviewIEC />,
          HydrateFallback: LoadingSpinner,
          loader: routeMaskReviewIECLoader,
        },
        {
          path: "mask/review/vr/:visual_review_instance_id",
          element: <RouteMaskReviewVR />,
          HydrateFallback: LoadingSpinner,
          loader: routeMaskerReviewVRLoader,
        },
        {
          path: "review/nifti/file/:fileId",
          element: <RouteNiftiReviewFile />,
          HydrateFallback: LoadingSpinner,
          loader: routeNiftiReviewFileLoader,
        },
        {
          path: "review/nifti/vr/:nifti_visual_review_instance_id",
          element: <RouteNiftiReviewVR />,
          HydrateFallback: LoadingSpinner,
          loader: routeNiftiReviewVRLoader,
        },
        {
          path: "review/dicom/iec/:iec",
          element: <RouteDicomReviewIEC />,
          HydrateFallback: LoadingSpinner,
          loader: routeDicomReviewIECLoader,
        },
        {
          path: "review/dicom/vr/:visual_review_instance_id",
          element: <RouteDicomReviewVR />,
          HydrateFallback: LoadingSpinner,
          loader: routeDicomReviewVRLoader,
        },
        {
          path: "dump/:file_id",
          element: <RouteDump />,
          HydrateFallback: LoadingSpinner,
          loader: routeDumpLoader,
        },
      ],
    },
  ],
  {
    basename: "/mira",
  },
);

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <Provider store={store}>
    <EnableCornerstone>
      <LoadingOverlay>
        <RouterProvider router={router} />
      </LoadingOverlay>
    </EnableCornerstone>
  </Provider>,
);
