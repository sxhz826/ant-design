import classNames from 'classnames';
import RcTooltip from 'rc-tooltip';
import type { placements as Placements } from 'rc-tooltip/lib/placements';
import type { TooltipProps as RcTooltipProps } from 'rc-tooltip/lib/Tooltip';
import useMergedState from 'rc-util/lib/hooks/useMergedState';
import * as React from 'react';
import { ConfigContext } from '../config-provider';
import type { PresetColorType } from '../_util/colors';
import { PresetColorTypes } from '../_util/colors';
import { getTransitionName } from '../_util/motion';
import getPlacements, { AdjustOverflow, PlacementsConfig } from '../_util/placements';
import { cloneElement, isValidElement, isFragment } from '../_util/reactNode';
import type { LiteralUnion } from '../_util/type';
import warning from '../_util/warning';

export { AdjustOverflow, PlacementsConfig };

export type TooltipPlacement =
  | 'top'
  | 'left'
  | 'right'
  | 'bottom'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'leftTop'
  | 'leftBottom'
  | 'rightTop'
  | 'rightBottom';

// https://github.com/react-component/tooltip
// https://github.com/yiminghe/dom-align
export interface TooltipAlignConfig {
  points?: [string, string];
  offset?: [number | string, number | string];
  targetOffset?: [number | string, number | string];
  overflow?: { adjustX: boolean; adjustY: boolean };
  useCssRight?: boolean;
  useCssBottom?: boolean;
  useCssTransform?: boolean;
}
// remove this after RcTooltip switch visible to open.
interface LegacyTooltipProps
  extends Partial<
    Omit<
      RcTooltipProps,
      'children' | 'visible' | 'defaultVisible' | 'onVisibleChange' | 'afterVisibleChange'
    >
  > {
  /**
   * @deprecated `visible` is deprecated which will be removed in next major version. Please use
   *   `open` instead.
   */
  visible?: RcTooltipProps['visible'];
  open?: RcTooltipProps['visible'];
  /**
   * @deprecated `defaultVisible` is deprecated which will be removed in next major version. Please
   *   use `defaultOpen` instead.
   */
  defaultVisible?: RcTooltipProps['defaultVisible'];
  defaultOpen?: RcTooltipProps['defaultVisible'];
  /**
   * @deprecated `onVisibleChange` is deprecated which will be removed in next major version. Please
   *   use `onOpenChange` instead.
   */
  onVisibleChange?: RcTooltipProps['onVisibleChange'];
  onOpenChange?: RcTooltipProps['onVisibleChange'];
  /**
   * @deprecated `afterVisibleChange` is deprecated which will be removed in next major version.
   *   Please use `afterOpenChange` instead.
   */
  afterVisibleChange?: RcTooltipProps['afterVisibleChange'];
  afterOpenChange?: RcTooltipProps['afterVisibleChange'];
}

export interface AbstractTooltipProps extends LegacyTooltipProps {
  style?: React.CSSProperties;
  className?: string;
  color?: LiteralUnion<PresetColorType, string>;
  placement?: TooltipPlacement;
  builtinPlacements?: typeof Placements;
  openClassName?: string;
  arrowPointAtCenter?: boolean;
  autoAdjustOverflow?: boolean | AdjustOverflow;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  children?: React.ReactNode;
}

export type RenderFunction = () => React.ReactNode;

export interface TooltipPropsWithOverlay extends AbstractTooltipProps {
  title?: React.ReactNode | RenderFunction;
  overlay?: React.ReactNode | RenderFunction;
}

export interface TooltipPropsWithTitle extends AbstractTooltipProps {
  title: React.ReactNode | RenderFunction;
  overlay?: React.ReactNode | RenderFunction;
}

export declare type TooltipProps = TooltipPropsWithTitle | TooltipPropsWithOverlay;

const splitObject = (obj: any, keys: string[]) => {
  const picked: any = {};
  const omitted: any = { ...obj };
  keys.forEach(key => {
    if (obj && key in obj) {
      picked[key] = obj[key];
      delete omitted[key];
    }
  });
  return { picked, omitted };
};
const PresetColorRegex = new RegExp(`^(${PresetColorTypes.join('|')})(-inverse)?$`);

// Fix Tooltip won't hide at disabled button
// mouse events don't trigger at disabled button in Chrome
// https://github.com/react-component/tooltip/issues/18
function getDisabledCompatibleChildren(element: React.ReactElement<any>, prefixCls: string) {
  const elementType = element.type as any;
  if (
    ((elementType.__ANT_BUTTON === true || element.type === 'button') && element.props.disabled) ||
    (elementType.__ANT_SWITCH === true && (element.props.disabled || element.props.loading)) ||
    (elementType.__ANT_RADIO === true && element.props.disabled)
  ) {
    // Pick some layout related style properties up to span
    // Prevent layout bugs like https://github.com/ant-design/ant-design/issues/5254
    const { picked, omitted } = splitObject(element.props.style, [
      'position',
      'left',
      'right',
      'top',
      'bottom',
      'float',
      'display',
      'zIndex',
    ]);
    const spanStyle = {
      display: 'inline-block', // default inline-block is important
      ...picked,
      cursor: 'not-allowed',
      width: element.props.block ? '100%' : null,
    };
    const buttonStyle = {
      ...omitted,
      pointerEvents: 'none',
    };
    const child = cloneElement(element, {
      style: buttonStyle,
      className: null,
    });
    return (
      <span
        style={spanStyle}
        className={classNames(element.props.className, `${prefixCls}-disabled-compatible-wrapper`)}
      >
        {child}
      </span>
    );
  }
  return element;
}

const Tooltip = React.forwardRef<unknown, TooltipProps>((props, ref) => {
  const {
    getPopupContainer: getContextPopupContainer,
    getPrefixCls,
    direction,
  } = React.useContext(ConfigContext);

  // Warning for deprecated usage
  if (process.env.NODE_ENV !== 'production') {
    [
      ['visible', 'open'],
      ['defaultVisible', 'defaultOpen'],
      ['onVisibleChange', 'onOpenChange'],
      ['afterVisibleChange', 'afterOpenChange'],
    ].forEach(([deprecatedName, newName]) => {
      warning(
        !(deprecatedName in props),
        'Tooltip',
        `\`${deprecatedName}\` is deprecated which will be removed in next major version, please use \`${newName}\` instead.`,
      );
    });
  }

  const [open, setOpen] = useMergedState(false, {
    value: props.open !== undefined ? props.open : props.visible,
    defaultValue: props.defaultOpen !== undefined ? props.defaultOpen : props.defaultVisible,
  });

  const isNoTitle = () => {
    const { title, overlay } = props;
    return !title && !overlay && title !== 0; // overlay for old version compatibility
  };

  const onOpenChange = (vis: boolean) => {
    setOpen(isNoTitle() ? false : vis);

    if (!isNoTitle()) {
      props.onOpenChange?.(vis);
      props.onVisibleChange?.(vis);
    }
  };

  const getTooltipPlacements = () => {
    const { builtinPlacements, arrowPointAtCenter, autoAdjustOverflow } = props;
    return (
      builtinPlacements ||
      getPlacements({
        arrowPointAtCenter,
        autoAdjustOverflow,
      })
    );
  };

  // 动态设置动画点
  const onPopupAlign = (domNode: HTMLElement, align: any) => {
    const placements: any = getTooltipPlacements();
    // 当前返回的位置
    const placement = Object.keys(placements).find(
      key =>
        placements[key].points[0] === align.points[0] &&
        placements[key].points[1] === align.points[1],
    );
    if (!placement) {
      return;
    }
    // 根据当前坐标设置动画点
    const rect = domNode.getBoundingClientRect();
    const transformOrigin = {
      top: '50%',
      left: '50%',
    };
    if (placement.indexOf('top') >= 0 || placement.indexOf('Bottom') >= 0) {
      transformOrigin.top = `${rect.height - align.offset[1]}px`;
    } else if (placement.indexOf('Top') >= 0 || placement.indexOf('bottom') >= 0) {
      transformOrigin.top = `${-align.offset[1]}px`;
    }
    if (placement.indexOf('left') >= 0 || placement.indexOf('Right') >= 0) {
      transformOrigin.left = `${rect.width - align.offset[0]}px`;
    } else if (placement.indexOf('right') >= 0 || placement.indexOf('Left') >= 0) {
      transformOrigin.left = `${-align.offset[0]}px`;
    }
    domNode.style.transformOrigin = `${transformOrigin.left} ${transformOrigin.top}`;
  };

  const getOverlay = () => {
    const { title, overlay } = props;
    if (title === 0) {
      return title;
    }
    return overlay || title || '';
  };

  const { getPopupContainer, ...otherProps } = props;

  const {
    prefixCls: customizePrefixCls,
    openClassName,
    getTooltipContainer,
    overlayClassName,
    color,
    overlayInnerStyle,
    children,
  } = props;
  const prefixCls = getPrefixCls('tooltip', customizePrefixCls);
  const rootPrefixCls = getPrefixCls();

  let tempOpen = open;
  // Hide tooltip when there is no title
  if (!('open' in props) && !('visible' in props) && isNoTitle()) {
    tempOpen = false;
  }

  const child = getDisabledCompatibleChildren(
    isValidElement(children) && !isFragment(children) ? children : <span>{children}</span>,
    prefixCls,
  );
  const childProps = child.props;
  const childCls =
    !childProps.className || typeof childProps.className === 'string'
      ? classNames(childProps.className, {
          [openClassName || `${prefixCls}-open`]: true,
        })
      : childProps.className;

  const customOverlayClassName = classNames(overlayClassName, {
    [`${prefixCls}-rtl`]: direction === 'rtl',
    [`${prefixCls}-${color}`]: color && PresetColorRegex.test(color),
  });

  let formattedOverlayInnerStyle = overlayInnerStyle;
  let arrowContentStyle;
  if (color && !PresetColorRegex.test(color)) {
    formattedOverlayInnerStyle = { ...overlayInnerStyle, background: color };
    // @ts-ignore
    arrowContentStyle = { '--antd-arrow-background-color': color };
  }

  return (
    <RcTooltip
      {...otherProps}
      prefixCls={prefixCls}
      overlayClassName={customOverlayClassName}
      getTooltipContainer={getPopupContainer || getTooltipContainer || getContextPopupContainer}
      ref={ref}
      builtinPlacements={getTooltipPlacements()}
      overlay={getOverlay()}
      visible={tempOpen}
      onVisibleChange={onOpenChange}
      onPopupAlign={onPopupAlign}
      overlayInnerStyle={formattedOverlayInnerStyle}
      arrowContent={<span className={`${prefixCls}-arrow-content`} style={arrowContentStyle} />}
      motion={{
        motionName: getTransitionName(rootPrefixCls, 'zoom-big-fast', props.transitionName),
        motionDeadline: 1000,
      }}
    >
      {tempOpen ? cloneElement(child, { className: childCls }) : child}
    </RcTooltip>
  );
});

if (process.env.NODE_ENV !== 'production') {
  Tooltip.displayName = 'Tooltip';
}

Tooltip.defaultProps = {
  placement: 'top' as TooltipPlacement,
  mouseEnterDelay: 0.1,
  mouseLeaveDelay: 0.1,
  arrowPointAtCenter: false,
  autoAdjustOverflow: true,
};

export default Tooltip;
