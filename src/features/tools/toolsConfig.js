import { useSelector, useDispatch } from 'react-redux';
import { Enums } from '@/features/presentationSlice'
import { setOption } from '@/features/optionSlice';

const maybe = (condition, item) => condition ? [item]: [];

export default function useToolsConfigs({ manager }) {
  const dispatch = useDispatch();
  const globalToolsConfig = useSelector(state => state.presentation.toolsConfig);

  const viewGroupButtonConfig = [
    ...maybe(globalToolsConfig.viewToolGroup.visibility.volume, {
      name: "Volume",
      icon: "deployed_code",
      action: () => dispatch(setOption(
        {
          key: "view",
          value: Enums.ViewOptions.VOLUME,
        }
      )),
    }),
    ...maybe(globalToolsConfig.viewToolGroup.visibility.projection, {
      name: "Maximum Intensity Projection",
      icon: "light_mode",
      action: () => dispatch(setOption(
        {
          key: "view",
          value: Enums.ViewOptions.PROJECTION,
        }
      )),
    }),
    ...maybe(globalToolsConfig.viewToolGroup.visibility.stack, {
      name: "Stack",
      icon: "stacks",
      action: () => dispatch(setOption(
        {
          key: "view",
          value: Enums.ViewOptions.STACK,
        }
      )),
    }),
  ];


  const functionGroupButtonConfig = [
    ...maybe(globalToolsConfig.functionToolGroup.visibility.mask, {
      name: "Mask",
      icon: "domino_mask",
      action: () => manager.switchFunctionMode(Enums.FunctionOptions.MASK),
    }),
    ...maybe(globalToolsConfig.functionToolGroup.visibility.blackout, {
      name: "Blackout",
      icon: "imagesearch_roller",
      action: () => manager.switchFunctionMode(Enums.FunctionOptions.BLACKOUT),
    }),
    ...maybe(globalToolsConfig.functionToolGroup.visibility.mask, {
      name: "Slice Remove",
      icon: "content_cut",
      action: () => manager.switchFunctionMode(Enums.FunctionOptions.SLICE_REMOVE),
    }),
  ];

  const formGroupButtonConfig = [
    ...maybe(globalToolsConfig.formToolGroup.visibility.cylinder, {
      name: "Cylinder",
      icon: "circle",
      action: () => manager.switchFormMode(Enums.FormOptions.CYLINDER),
    }),
    ...maybe(globalToolsConfig.formToolGroup.visibility.cuboid, {
      name: "Cuboid",
      icon: "square",
      action: () => manager.switchFormMode(Enums.FormOptions.CUBOID),
    }),
  ];

  const leftClickGroupButtonConfig = [
    ...maybe(globalToolsConfig.leftClickToolGroup.visibility.windowLevel, {
      name: "Window Level",
      icon: "exposure",
      action: () => manager.switchLeftClickMode(Enums.LeftClickOptions.WINDOW_LEVEL),
    }),
    ...maybe(globalToolsConfig.leftClickToolGroup.visibility.crossHairs, {
      name: "Crosshairs",
      icon: "point_scan",
      action: () => manager.switchLeftClickMode(Enums.LeftClickOptions.CROSSHAIRS),
    }),
    ...maybe(globalToolsConfig.leftClickToolGroup.visibility.rectangleScissors, {
      name: "Selection",
      icon: "gesture_select",
      action: () => manager.switchLeftClickMode(Enums.LeftClickOptions.SELECTION),
    }),
  ];

  const rightClickGroupButtonConfig = [
    ...maybe(globalToolsConfig.rightClickToolGroup.visibility.zoom, {
      name: "Zoom",
      icon: "search",
      action: () => manager.switchRightClickMode(Enums.RightClickOptions.ZOOM),
    }),
    ...maybe(globalToolsConfig.rightClickToolGroup.visibility.pan, {
      name: "Pan",
      icon: "pan_tool",
      action: () => manager.switchRightClickMode(Enums.RightClickOptions.PAN),
    }),
  ];

  return {
    functionGroupButtonConfig,
    formGroupButtonConfig,
    leftClickGroupButtonConfig,
    rightClickGroupButtonConfig,
    viewGroupButtonConfig,
  };
}
