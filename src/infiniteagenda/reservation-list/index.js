/**
 * @flow
 */
import React, {Component} from 'react';
import {
  ActivityIndicator,
  View
} from 'react-native';
import Reservation from './reservation';
import PropTypes from 'prop-types';
import XDate from 'xdate';

import dateutils from '../../dateutils';
import styleConstructor from './style';

import RecyclerViewList from 'react-native-recyclerview-list';
import DataSource from 'react-native-recyclerview-list/lib/DataSource';


class ReactComp extends Component {
  static propTypes = {
    /*
     * Specify your item comparison function for increased performance
     */
    rowHasChanged: PropTypes.func,
    /**
     * Custom loading indicator used at the top and bottom of data, while waiting for new data
     * 
     * @param (reservations)          : An array of items stored on onReadDayReservations() 
     */
    renderItem: PropTypes.func,
    /*
     * Render a day
     * 
     * @param (day)                   : Current day as xdate
     * @param (items)                 : Days's items stored on onReadyDayReservations()
     */
    renderDay: PropTypes.func,
    /*
     * Render agenda day content when there is no reservations for the day.
     * 
     * @param (day)                   : Current day as xdate
     * @param (items)                 : Days's items stored on onReadyDayReservations()
     */
    renderEmptyDate: PropTypes.func,
    /**
     * Custom loading indicator used at the top and bottom of data, while waiting for new data
     * 
     * @param (location : string) = 'TOP' | 'BOTTOM'
     */
    renderLoadingIndicator: PropTypes.func,
    /*
     * callback that gets called when day changes while scrolling agenda list
     */
    onDayChange: PropTypes.func,
    /*
     * onScroll ListView event
     */
    onScroll: PropTypes.func,
    // the list of items that have to be displayed in agenda. If you want to render item as empty date
    // the value of date key kas to be an empty array []. If there exists no value for date key it is
    // considered that the date in question is not yet loaded
    //reservations: PropTypes.object,

    onReadDayReservations: PropTypes.func.isRequired,
    /**
     * Number of days remaining before the current data end or start, when new data loading should be triggered. (Default is 15)
     */
    dataLoadThreshold: PropTypes.number,
    /**
     * Buffer to read while asking for data. Keep the buffer size at least as much items can be shown in screen at one. The component will
     * read automatically same amount of data before. So the actual data size will be always three times the buffer size. (Default is 30)
     */
    bufferSize: PropTypes.number,
    /**
     * Selected date on agend. If no date is set, the current day will be user.
     */
    selectedDay: PropTypes.instanceOf(XDate),
  };

  static defaultProps = {
    dataLoadThreshold: 15,
    bufferSize: 30
  }

  constructor(props) {
    super(props);
    this.styles = styleConstructor(props.theme);
    this.heights=[];
    this.selectedDay = this.props.selectedDay || new XDate();
    
    this.pastLimit = this.selectedDay.clone();
    this.pastLimit.addDays(-15);
    this.futureLimit = this.selectedDay.clone();
    this.futureLimit.addDays(15);
    this.state = {
      datasource: new DataSource([], item => item.id),
      data: {},
      dataInitialized: false,    
      loadingDataTop: false,
      loadingDataBottom: false,
    };

    this.scrollOver = true;
  }

  componentWillMount() {

    if (!this.props.onReadDayReservations) {
      console.error('onReadDayReservations property is not assigned. Component will not reseive any data.'); // eslint-disable-line
      return;
    }
    this._loadData('FUTURE');
  }

  componentWillReceiveProps(nextProps) {
    if (!dateutils.sameDate(nextProps.selectedDay, this.props.selectedDay)) {
      this._setSelectedDay(nextProps.selectedDay);
    } 
  }

  /**
   * Get first item's index that matches the date
   */
  _getIndexOfDate = (day, reservations) => {
    const r = reservations || this.state.datasource._data;

    for (let i = 0; i < r.length; i++) {
      if (dateutils.sameDate(day, r[i].day)) {
        return i;
      } 
    } 
    return undefined;
  }

  _lastAnimationStartTick = 0;

  _wipeDataAndReload = day => {
    const { datasource } = this.state;

    datasource.splice(0, datasource.size());
    
    this._loadData('FUTURE', () => {
      let index = this._getIndexOfDate(day);
      this._scrollToIndex(index);
    });
  }

  _setSelectedDay = (selectedDay, scroll = true) => {
    if (dateutils.sameDate(this.selectedDay, selectedDay)) {
      return;
    }

    this.selectedDay = selectedDay;

    let index = this._getIndexOfDate(selectedDay);

    if (!index) {
      const { datasource } = this.state;
      /**
       * New data needs to be loaded
       */
      if (datasource.size() === 0) {
        this._wipeDataAndReload(selectedDay);
        return;
      }

      let topDay = datasource._data[0].day;
      let bottomDay = datasource._data[datasource._data.length - 1].day;

      if (dateutils.isDateBefore(selectedDay, topDay)) {
        let dayRange = selectedDay.diffDays(topDay);

        if (dayRange < this.props.bufferSize) {
          // The date is near to current data, so we Scroll to top and wait for the new data to load
          this._scrollToIndex(0);
          this._loadData('PAST');
        }
        else {
          this._wipeDataAndReload(selectedDay);
        }
      } else {
        if (dateutils.isDateAfter(bottomDay)) {
          let dayRange = bottomDay.diffDays(selectedDay);
          
          if (dayRange < this.props.bufferSize) {
            this._scrollToEnd();
            this._loadData('FUTURE');
          }
          else {
            this._wipeDataAndReload(selectedDay);
          }
        }
      }
    } 
    else {
      scroll && this._scrollToIndex(index);
    }

    /**
     * Start preloading if the selected days index is over the safe zone in the top or bottom of the area.
     */
    if ( !(this._isReceivingData()) && (index < this.props.dataLoadThreshold || index > (this.state.datasource._data.length - this.props.dataLoadThreshold))) {
      if (this.props.onReadDayReservations) {
        this._loadData(index < this.props.dataLoadThreshold ? 'PAST' : 'FUTURE');
      }
    }
  }

  _scrollToIndex = index => {
    this._lastAnimationStartTick = new Date().getTime();
    this.list.scrollToIndex({ 
      animated: true, 
      index, 
      viewOffset: -10 
    });
  }

  _scrollToEnd = () => {
    this._lastAnimationStartTick = new Date().getTime();
    this.list.scrollToEnd({animated: true});
  }

  /**
   * Tell if there is an active data retrieval in action
   */
  _isReceivingData = () => {
    return this.state.loadingDataBottom || this.state.loadingDataTop || this._isLoading;
  }

  _isLoading = false;

  /**
   * Load data from user's data function and reorder data set with it. The function will remove the tail of the data at the other end,
   * so the actual in memory data will remain reasonable.
   * 
   * @param (direction: 'PAST' | 'FUTURE') The direction where to day data should be read compared to current data. If direction
   *                                       is into the past, the data query is done based the first current data's data items date
   *                                       and if the direction is into the future, the last data items data will be used as referense
   *                                       for data query from the component's user. If there is no data available, the selected day 
   *                                       will be used.
   * @param (callback: func)               Callback to be triggered when data has been loaded
   */
  _loadData = (direction, callback) => {

    let bufferSize = this.props.bufferSize;

    if (this._isReceivingData())
      return;

    let currentDay;
    this._isLoading = true;

    if (direction === 'PAST') {
      currentDay = this.state.datasource._data[0].day.clone();
      this.setState({
        loadingDataTop: true
      });
    }
    else {
      this.setState({
        loadingDataBottom: true
      });

      if (this.state.datasource._data.length > 0) {
        currentDay = this.state.datasource._data[this.state.datasource._data.length - 1].day.clone() 
      } else { 
        /*
         * Special case when data has not been loaded yet
         */ 
        currentDay = this.selectedDay.clone();
        currentDay.addDays(-bufferSize);
        bufferSize *= 3;
      }
    }

    this.props.onReadDayReservations(currentDay.toString('yyyy-MM-dd'), bufferSize, direction, newData => {

      let { datasource, data } = this.state;
      const keys = Object.getOwnPropertyNames(newData);
      let items = [];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        data[key] = newData[key];

        let res = this.parseReservationsForData(new XDate(key), newData[key]);
        let reservations = [];

        for (let j = 0; j < res.length; j++) {
          let item = res[j];
          item.id = item.day.toString('yyyy-MM-dd');
          reservations.push(item);
        }
        items.push(...reservations);
      }

      let currentDataLength = datasource._data.length;

      if (direction === 'PAST')  {
        datasource.splice(0, 0, ...items);

        if (currentDataLength !== 0) {
          currentDay.addDays(this.props.bufferSize * 2);
          let index = this._getIndexOfDate(currentDay, datasource._data);
          if (index) {
            datasource.splice(index, datasource._data.length - index);
          }
        }
      } else { 
        datasource.splice(datasource.size(), 0, ...items);

        if (currentDataLength !== 0) {
          currentDay.addDays(-this.props.bufferSize * 2);
          let index = this._getIndexOfDate(currentDay, datasource._data);
          if (index) {
            datasource.splice(0, index);
          }
        }
      }

      let state = {
        loadingDataTop: false,
        loadingDataBottom: false
      };

      if (!this.state.dataInitialized) {
        state.dataInitialized = true;
      }
      this.setState(state);

      this._isLoading = false;

      callback && callback();
    });
  }

  _onVisibleItemsChange = ({ firstIndex }) => {

    if (this.state.datasource) {
      let item = this.state.datasource._data[firstIndex];
      if (item) {
        let day = item.day;
        const sameDate = dateutils.sameDate(day, this.selectedDay);
        if (!sameDate && this.scrollOver) {
          let delta = new Date().getTime() - this._lastAnimationStartTick;

          if (delta > 3000) {
            this._setSelectedDay(day.clone(), false);
            this.props.onDayChange(day.clone());
          }
        }
      }
    }
  }
  
  _renderRow = ({ item }) => {
    return (
      <View>
        <Reservation
          item={item}
          renderItem={this.props.renderItem}
          renderDay={this.props.renderDay}
          renderEmptyDate={this.props.renderEmptyDate}
          theme={this.props.theme}
          rowHasChanged={this.props.rowHasChanged}
        />
      </View>
    );
  }

  parseReservationsForData(day, res) {
    if (res && res.length) {
      return res.map((reservation, i) => {
        return {
          reservation,
          date: i ? false : day,
          day
        };
      });
    } else if (res) {
      return [{
        date: day,
        day
      }];
    } else {
      return false;
    }
  }

  getReservationsForDay(iterator, props, updatedReservations) {
    const day = iterator.clone();
    let reservations = updatedReservations ? updatedReservations : this.props.reservations;

    const res = reservations[day.toString('yyyy-MM-dd')];
    if (res && res.length) {
      return res.map((reservation, i) => {
        return {
          reservation,
          date: i ? false : day,
          day
        };
      });
    } else if (res) {
      return [{
        date: iterator.clone(),
        day
      }];
    } else {
      return false;
    }
  }

  onListTouch() {
    this.scrollOver = true;
  }

  render() {
    if (!this.state.dataInitialized) {
      if (this.props.renderEmptyData) {
        return this.props.renderEmptyData();
      }
      return (<ActivityIndicator style={{marginTop: 80}}/>);
    }

    return (
      <RecyclerViewList
          ref={(component) => this.list = component}
          style={[this.props.style, { flex: 1 }]}
          dataSource={this.state.datasource}
          renderItem={this._renderRow}
          windowSize={20}
          onScroll={this._onScroll}
          itemAnimatorEnabled={false}
          onVisibleItemsChange={this._onVisibleItemsChange}
          initialScrollIndex={this.selectedDay && this._getIndexOfDate(this.selectedDay)}
          ListHeaderComponent={this._renderLoader('TOP')}
          ListFooterComponent={this._renderLoader('BOTTOM')}
          ListEmptyComponent={this._renderEmpty()}
          ItemSeparatorComponent={(
            <View style={{ borderBottomWidth: 1, borderColor: '#e7e7e7', marginHorizontal: 5, marginVertical: 10 }} />
          )} />
    );
  }

  _renderEmpty = () => {
    if (this.props.renderEmptyData) {
      return this.props.renderEmptyData();
    }
    return null;
  }

  _renderLoader = position => {
    if (!(position == 'TOP' ? this.state.loadingDataTop : this.state.loadingDataBottom)) {
      return null;
    }
    
    if (this.props.renderLoadingIndicator) {
      return this.props.renderLoadingIndicator(position);
    }
    return (<View style={{ paddingTop: 15, backgroundColor: '#eee' }} ><ActivityIndicator size="large" color="grey" /></View>)           
  }
}

export default ReactComp;
