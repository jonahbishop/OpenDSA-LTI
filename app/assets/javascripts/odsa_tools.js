$(function () {

  //
  // Time Tracking
  //
  var odsaStore = localforage.createInstance({
    name: 'OpenDSA_analytics',
    storeName: 'OpenDSA_analytics'
  })

  function getWeeksDates(start, end) {
    var sDate;
    var eDate;
    var dateArr = [];
    var daysHash = {};

    while (start <= end) {
      daysHash[getTimestamp(start, 'yyyymmdd')] = dateArr.length
      if (start.getDay() == 1 || (dateArr.length == 0 && !sDate)) {
        sDate = new Date(start.getTime());
      }
      if ((sDate && start.getDay() == 0) || start.getTime() == end.getTime()) {
        eDate = new Date(start.getTime());
      }
      if (sDate && eDate) {
        dateArr.push([sDate, eDate]);
        sDate = undefined;
        eDate = undefined;
      }
      start.setDate(start.getDate() + 1);
    }

    daysHash[getTimestamp(end, 'yyyymmdd')] = dateArr.length
    var lastDate = new Date(dateArr[dateArr.length - 1][1])
    if (lastDate < end) {
      dateArr.push([new Date(lastDate.setDate(lastDate.getDate() + 1)), end]);
    }
    return { "weeksDates": dateArr, "daysHash": daysHash }
  }

  function getLookupData(odsaStore, date) {
    var currentDate = date || getTimestamp(new Date, 'yyyymmdd')

    odsaStore.getItem(['odsaLookupData', currentDate].join('-'))
      .then(function (odsaLookupData) {
        if (!odsaLookupData) {
          Plotly.d3.json("/course_offerings/time_tracking_lookup/" + ODSA_DATA.course_offering_id,
            function (err, data) {
              var starts_on = data["term"][0]["starts_on"]
              let { weeksDates, daysHash } = getWeeksDates(new Date(starts_on + "T23:59:59-0000"), new Date())
              var weeksDatesShort = weeksDates.map(function (x) {
                var startDate = getTimestamp(x[0], 'yyyymmdd')
                var endDate = getTimestamp(x[1], 'yyyymmdd')
                return [startDate, endDate]
              })
              var weeksNames = weeksDates.map(function (x) {
                var startDate = getTimestamp(x[0]).split('-')
                var endDate = getTimestamp(x[1]).split('-')
                var startDateMonth = x[0].toLocaleString('default', { month: 'short' })
                var endDateMonth = x[1].toLocaleString('default', { month: 'short' })
                return startDateMonth + startDate[2] + '-' + endDateMonth + endDate[2]
              })
              var weeksEndDates = weeksDatesShort.map(function (x) { return x[1] })
              var users = data["users"]
              var usersHash = {}
              for (var i = 0; i < users.length; i++) {
                usersHash[String(users[i]["id"])] = i
              }

              var chapters = data["chapters"]
              var chaptersNames = []
              var chaptersNamesIds = []
              for (var i = 0; i < chapters.length; i++) {
                var chapterName = chapters[i]['ch_name']
                var chapterId = chapters[i]['ch_id']
                if (!chaptersNames.includes(chapterName)) {
                  chaptersNames.push(chapterName)
                  chaptersNamesIds.push({ 'ch_name': chapterName, 'ch_id': chapterId })
                }
              }


              var chaptersHash = {}
              var chaptersDates = []
              for (var i = 0; i < chaptersNamesIds.length; i++) {
                chaptersHash[String(chaptersNamesIds[i]["ch_id"])] = i
                chaptersDates.push(weeksEndDates[i])
              }

              var lookups = {
                "users": data["users"],
                "chapters": data["chapters"],
                "chaptersNames": chaptersNames,
                "term": data["term"][0],
                "weeksDates": weeksDatesShort,
                "weeksNames": weeksNames,
                "weeksEndDates": weeksEndDates,
                "daysHash": daysHash,
                "usersHash": usersHash,
                "chaptersHash": chaptersHash,
                "chaptersNamesIds": chaptersNamesIds,
                "chaptersDates": chaptersDates
              }

              odsaStore.setItem(['odsaLookupData', currentDate].join('-'), lookups)
              deleteStoreData(odsaStore, "odsaLookupData", currentDate)
              getTimeTrackingData(odsaStore, currentDate, lookups)
            })
        }
      })
      .catch(function (err) {
        // This code runs if there were any errors
        console.log(err);
      });
  }

  function deleteStoreData(odsaStore, dataPrefix, date) {
    var currentDate = date || getTimestamp(new Date, 'yyyymmdd')
    var dataPrefix = dataPrefix || ''
    var _keys = []
    var promise = new Promise((resolve, reject) => {
      odsaStore.keys()
        .then(function (keys) {
          keys.forEach(function (key, i) {
            if (key.startsWith(dataPrefix)) {
              var keyDate = key.split('-')[2];
              if (parseInt(keyDate) != parseInt(currentDate)) {
                _keys.push(key);
              }
            }
          })
          var promises = _keys.map(function (item) { return odsaStore.removeItem(item); });
          Promise.all(promises)
            .then((sessions) => {
              console.log("Store data " + dataPrefix + " was deleted: " + JSON.stringify(_keys))
              resolve(sessions)
            });
        })
        .catch(function (err) {
          console.log("Error deleting store data " + dataPrefix + ": " + err);
          reject(err)
        });
    });
    return promise;
  }

  function getTimeTrackingData(odsaStore, date, lookups) {
    var currentDate = date || getTimestamp(new Date, 'yyyymmdd')

    odsaStore.getItem(['odsaTimeTrackingData', currentDate].join('-'))
      .then(function (odsaTimeTrackingData) {
        if (!odsaTimeTrackingData) {
          Plotly.d3.json("/course_offerings/time_tracking_data/" + ODSA_DATA.course_offering_id,
            function (err, data) {
              odsaStore.setItem(['odsaTimeTrackingData', currentDate].join('-'), data)
              deleteStoreData(odsaStore, "odsaTimeTrackingData", currentDate)
              var { weeksData, chaptersData } = formatTimeTrackingData(data, lookups)

              initPlotly({
                'weeksData': weeksData,
                'chaptersData': chaptersData,
                'weeksNames': lookups['weeksEndNames'],
                'weeksDates': lookups['weeksDates'],
                'chaptersNames': lookups['chaptersNames'],
                'chaptersDates': lookups['chaptersDates'],
                'studentsInfo': lookups['users']
              })

            })
        }
      })
      .catch(function (err) {
        // This code runs if there were any errors
        console.log(err);
      });
  }

  function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  function generateRandomData(date) {
    var currentDate = date || getTimestamp(new Date, 'yyyymmdd')
    var insertStmt = "INSERT INTO opendsa.odsa_user_time_trackings VALUES"

    odsaStore.getItem(['odsaLookupData', currentDate].join('-'))
      .then(function (lookups) {
        var weeksEndDates = lookups['weeksEndDates']
        var users = lookups['users']
        var chapters = lookups['chapters']
        var statement = ""
        var openBrace = "("
        var sectionName = "'NotNull'"
        var closeBrace = ")"
        var comma = ","
        var simiColon = ";"
        var nullStr = "NULL"

        // for every user
        for (var i = 0; i < users.length; i++) {
          // for every chapter
          for (var j = 0; j < chapters.length; j++) {
            // for every week
            for (var k = 0; k < weeksEndDates.length; k++) {
              var userId = users[i]['id']
              var instBookId = ODSA_DATA.inst_book_id
              var instChapterModuleId = chapters[j]["mod_id"]
              var instChapterId = chapters[j]["ch_id"]
              var UUID = "'" + uuidv4() + "'"
              var sessionDate = weeksEndDates[k]
              var totalTime = parseFloat((Math.random() * (i + 1) * 7).toFixed(2))
              statement =
                openBrace +
                nullStr + comma +
                userId + comma +
                instBookId + comma +
                nullStr + comma +
                nullStr + comma +
                nullStr + comma +
                instChapterModuleId + comma +
                instChapterId + comma +
                nullStr + comma +
                nullStr + comma +
                UUID + comma +
                sessionDate + comma +
                totalTime + comma +
                sectionName + comma +
                nullStr + comma +
                nullStr +
                closeBrace + comma;

              insertStmt += statement
            }
          }
          insertStmt = insertStmt.replace(/.$/, simiColon)
          console.log(insertStmt)
          insertStmt = "INSERT INTO opendsa.odsa_user_time_trackings VALUES"
        }
      })
      .catch(function (err) {
        // This code runs if there were any errors
        console.log(err);
      });

  }

  function formatTimeTrackingData(data, lookups) {
    // TODO: validate input data object
    var weeksData = []
    var chaptersData = []
    var daysHash = lookups['daysHash']
    var chaptersHash = lookups['chaptersHash']
    var usersHash = lookups['usersHash']
    var weeksDates = lookups['weeksDates']
    var users = lookups['users']
    var chaptersNames = lookups['chaptersNames']

    // prepare weeksData matrix
    for (var i = 0; i < weeksDates.length; i++) {
      var a = new Array(users.length); for (let i = 0; i < users.length; ++i) a[i] = 0;
      weeksData.push(a)
    }

    // prepare chaptersData matrix
    for (var i = 0; i < chaptersNames.length; i++) {
      var a = new Array(users.length); for (let i = 0; i < users.length; ++i) a[i] = 0;
      chaptersData.push(a)
    }

    // add data to weeks matrix
    for (var i = 0; i < data.length; i++) {
      weeksData[daysHash[data[i]['dt']]][usersHash[data[i]['usr_id']]] += parseFloat(data[i]['tt'])
    }
    // add data to chapters matrix
    for (var i = 0; i < data.length; i++) {
      chaptersData[chaptersHash[data[i]['ch_id']]][usersHash[data[i]['usr_id']]] += parseFloat(data[i]['tt'])
    }
    // console.log(weeksData)
    // console.log(chaptersData)

    return { 'weeksData': weeksData, 'chaptersData': chaptersData }
  }

  getLookupData(odsaStore)

  // generateRandomData()

  function initPlotly(userData) {
    var studentsInfo = userData["studentsInfo"]
    var weeksData = userData["weeksData"]
    var weeksNames = userData["weeksNames"]
    var weeksDates = userData["weeksDates"]
    var chaptersData = userData["chaptersData"]
    var chaptersNames = userData["chaptersNames"]
    var chaptersDates = userData["chaptersDates"]
    var numOfWeeks = weeksData.length
    var numOfChapters = chaptersData.length

    var text = studentsInfo.map(x => x.first_name + " " + x.last_name + "<" + x.email + ">")
    var studentsInfoIndex = {};

    for (var i = 0; i < studentsInfo.length; i++) {
      studentsInfoIndex[studentsInfo[i]['email']] = i;
    }

    var plotlyBoxDiv = $("#plotlyBoxDiv")[0]

    var dataTables = null;
    var lineDataTables = null;
    var currentBoxTab = 'weeks';
    var currentLineTab = 'weeks';
    var currentLinePercentile = '25';

    function createDataTables(chosenStudentsInfo, caption, plot) {
      var plot = plot || "box"
      var caption = caption || ""
      var $students_caption = (plot === "box") ? $(".students_caption") : $(".students_caption_line")
      var $students_info = (plot === "box") ? $(".students_info") : $(".students_info_line")

      if ($(".students_caption").length) {
        $(".students_caption").text(caption);
      } else {
        $('#students_info').append('<caption style="caption-side: top" class="students_caption">' + caption + '</caption>');
      }

      return $('#students_info').DataTable({
        destroy: true,
        data: chosenStudentsInfo,
        columns: [
          { title: "Fist Name" },
          { title: "Last Name" },
          { title: "Email" },
          { title: "Reading time" }
        ]
      });
    }

    function clearDataTables(dataTables) {
      if ($(".students_caption").length) {
        $(".students_caption").text("");
      }

      dataTables.rows()
        .remove()
        .draw();
    }

    // plotly data
    var plotlyBoxData = []
    var weeksVisible = []
    var chaptersVisible = []
    // Add weeks
    for (var i = 0; i < weeksData.length; i++) {
      var result = {
        name: weeksNames[i],
        width: 0.5,
        quartilemethod: "inclusive",
        type: 'box',
        y: weeksData[i],
        text: text,
        hoverinfo: "all",
        hovertemplate: "%{text}<br>%{y:.2f} mins<extra></extra>",
        boxpoints: 'all',
        boxmean: "sd",
        jitter: 0.2,
        whiskerwidth: 0.2,
        fillcolor: 'cls',
        marker: {
          outliercolor: 'rgb(255, 0, 0)',
          size: 3,
          symbol: '0',
          opacity: 1
        },
        selectedpoints: [],
        selected: {
          marker: {
            size: 7,
            color: 'rgb(255, 0, 0)'
          }
        },
        line: {
          width: 1
        },
        hoverlabel: {
          font: { size: 15 }
        }
      };
      plotlyBoxData.push(result);
      weeksVisible.push(true)
      chaptersVisible.push(false)
    };

    // Add chapters
    for (var i = 0; i < chaptersData.length; i++) {
      var result = {
        name: chaptersNames[i],
        width: 0.5,
        quartilemethod: "inclusive",
        type: 'box',
        y: chaptersData[i],
        text: text,
        hoverinfo: "all",
        hovertemplate: "%{text}<br>%{y:.2f} mins<extra></extra>",
        boxpoints: 'all',
        boxmean: "sd",
        jitter: 0.2,
        whiskerwidth: 0.2,
        fillcolor: 'cls',
        marker: {
          outliercolor: 'rgb(255, 0, 0)',
          size: 3,
          symbol: '0',
          opacity: 1
        },
        selectedpoints: [],
        selected: {
          marker: {
            size: 7,
            color: 'rgb(255, 0, 0)'
          }
        },
        line: {
          width: 1
        },
        hoverlabel: {
          font: { size: 15 }
        },
        visible: false
      };
      plotlyBoxData.push(result);
      weeksVisible.push(false)
      chaptersVisible.push(true)
    };

    // plotly menu
    var updatemenus = [
      {
        buttons: [
          {
            name: 'weeks',
            args: [{ 'visible': weeksVisible },
            {
              'title': 'Total time students spend on OpenDSA materials per week.'
            }
            ],
            label: 'Weeks',
            method: 'update'
          },
          {
            name: 'chapters',
            args: [{ 'visible': chaptersVisible },
            {
              'title': 'Total time students spend on OpenDSA materials per chapter.'
            }
            ],
            label: 'Chapters',
            method: 'update'
          }
        ],
        direction: 'left',
        pad: { 'r': 10, 't': 10 },
        showactive: true,
        type: 'buttons',
        x: 1,
        xanchor: 'right',
        y: 1.2,
        yanchor: 'top'
      },
      {
        buttons: [
          {
            name: 'reset',
            label: 'Reset',
            method: 'skip',
            execute: false
          },
          {
            name: '25',
            label: '25th percentile',
            method: 'skip',
            execute: false
          },
          {
            name: '50',
            label: '50th percentile',
            method: 'skip',
            execute: false
          }
        ],
        direction: 'left',
        pad: { 'r': 10, 't': 10 },
        showactive: false,
        type: 'buttons',
        x: 0,
        xanchor: 'left',
        y: 1.2,
        yanchor: 'top'
      }
    ]

    // plotly layout
    var plotlyBoxLayout = {
      'title': 'Total time students spend on OpenDSA materials per week.',
      updatemenus: updatemenus,
      yaxis: {
        title: 'Reading time in mins.',
        autorange: true,
        showgrid: true,
        zeroline: true,
        dtick: 5,
        gridcolor: 'rgb(255, 255, 255)',
        gridwidth: 1,
        zerolinecolor: 'rgb(255, 255, 255)',
        zerolinewidth: 2
      },
      margin: {
        l: 40,
        r: 30,
        b: 80,
        t: 100
      },
      paper_bgcolor: 'rgb(243, 243, 243)',
      plot_bgcolor: 'rgb(243, 243, 243)',
      showlegend: true,
      legend: {
        x: 1.07,
        xanchor: 'right',
        y: 1
      }
    }

    // plotly initialize
    Plotly.newPlot(plotlyBoxDiv, plotlyBoxData, plotlyBoxLayout)
      .then(() => {
        $("#tools-accordion").accordionjs({ closeAble: true });
      })

    // get the index(es) of the active trace(s)
    function getActiveTraces() {
      var calcdata = plotlyBoxDiv.calcdata
      var activeTraces = []
      for (var i = 0; i < calcdata.length; i++) {
        if (calcdata[i][0]['x'] != undefined)
          activeTraces.push(i)
      }
      return activeTraces
    }

    // event handler to select points and show dataTables
    plotlyBoxDiv.on('plotly_buttonclicked', function (e) {
      var buttonName = e.button.name;
      var plotMean = null;
      var plotQ1 = null;
      var traceIndex = null
      var chosenStudents = [];
      var chosenStudentsInfo = [];
      var studentInfo = {};
      selectize.clear()

      if (['weeks', 'chapters'].includes(buttonName)) {
        currentBoxTab = buttonName;
        if (dataTables) {
          clearDataTables(dataTables)
        }
      } else {
        traceIndex = getActiveTraces()[0]

        plotMean = plotlyBoxDiv.calcdata[traceIndex][0]['med'];
        plotQ1 = plotlyBoxDiv.calcdata[traceIndex][0]['q1'];

        var tabIndex = (traceIndex + 1 > numOfWeeks) ? traceIndex - numOfWeeks : traceIndex;
        var refData = userData[currentBoxTab][tabIndex]
        var refName = userData[currentBoxTab + "_names"][tabIndex]
        if (buttonName == '25') {
          for (var i = 0; i < refData.length; i++) {
            if (refData[i] <= plotQ1) {
              chosenStudents.push(i);
              studentInfo = studentsInfo[i]
              chosenStudentsInfo.push([studentInfo['first_name'], studentInfo['last_name'], studentInfo['email'], refData[i]])
            }
          }
          dataTables = createDataTables(chosenStudentsInfo, "Students reading time less than 25th percentile for " + refName)
        } else if (buttonName == '50') {
          for (var i = 0; i < refData.length; i++) {
            if (refData[i] <= plotMean) {
              chosenStudents.push(i);
              studentInfo = studentsInfo[i]
              chosenStudentsInfo.push([studentInfo['first_name'], studentInfo['last_name'], studentInfo['email'], refData[i]])
            }
          }
          dataTables = createDataTables(chosenStudentsInfo, "Students reading time less than 50th percentile for " + refName)
        } else {
          chosenStudents = []
          if (dataTables) {
            clearDataTables(dataTables)
          }
        }

        plotlyBoxData[traceIndex]['selectedpoints'] = chosenStudents
        Plotly.update(plotlyBoxDiv, plotlyBoxData, plotlyBoxLayout);
      }
    })

    function updateBoxPlot(chosenStudents) {
      var chosenStudents = chosenStudents || []
      var traceIndex = getActiveTraces()

      for (var i = 0; i < traceIndex.length; i++) {
        plotlyBoxData[traceIndex[i]]['selectedpoints'] = chosenStudents
      }
      Plotly.update(plotlyBoxDiv, plotlyBoxData, plotlyBoxLayout)
    };

    //
    // selectize code
    //
    var REGEX_EMAIL = '([a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@' +
      '(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)';

    function formatName(item) {
      return $.trim((item.first_name || '') + ' ' + (item.last_name || ''));
    };

    // initialize selectize for box plot
    var $selectize = $('#select-for-box').selectize({
      plugins: ['remove_button'],
      persist: false,
      maxItems: null,
      valueField: 'email',
      labelField: 'name',
      searchField: ['first_name', 'last_name', 'email'],
      sortField: [
        { field: 'first_name', direction: 'asc' },
        { field: 'last_name', direction: 'asc' }
      ],
      options: studentsInfo,
      render: {
        item: function (item, escape) {
          var name = formatName(item);
          return '<div>' +
            (name ? '<span class="name">' + escape(name) + '</span>' : '') +
            (item.email ? '<span class="email">' + escape(item.email) + '</span>' : '') +
            '</div>';
        },
        option: function (item, escape) {
          var name = formatName(item);
          var label = name || item.email;
          var caption = name ? item.email : null;
          return '<div>' +
            '<span class="label">' + escape(label) + '</span>' +
            (caption ? '<span class="caption">' + escape(caption) + '</span>' : '') +
            '</div>';
        }
      },
      createFilter: function (input) {
        var regexpA = new RegExp('^' + REGEX_EMAIL + '$', 'i');
        var regexpB = new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i');
        return regexpA.test(input) || regexpB.test(input);
      },
      create: function (input) {
        if ((new RegExp('^' + REGEX_EMAIL + '$', 'i')).test(input)) {
          return { email: input };
        }
        var match = input.match(new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i'));
        if (match) {
          var name = $.trim(match[1]);
          var pos_space = name.indexOf(' ');
          var first_name = name.substring(0, pos_space);
          var last_name = name.substring(pos_space + 1);

          return {
            email: match[2],
            first_name: first_name,
            last_name: last_name
          };
        }
        alert('Invalid email address.');
        return false;
      }
    })

    var selectize = $selectize[0].selectize;

    // show current values in multi input dropdown
    $('select.selectized,input.selectized').each(function () {
      var $input = $(this);

      var update = function (e) {
        var selectedStudents = $input.val();
        if (selectedStudents) {
          var chosenStudents = [];
          for (var i = 0; i < selectedStudents.length; i++) {
            chosenStudents.push(studentsInfoIndex[selectedStudents[i]]);
          }
          updateBoxPlot(chosenStudents)
          if (dataTables) {
            clearDataTables(dataTables)
          }
        }
      }

      $(this).on('change', update);
    });


    // initialize selectize for box plot
    var $selectize_line = $('#select-for-line').selectize({
      plugins: ['remove_button'],
      persist: false,
      maxItems: null,
      valueField: 'email',
      labelField: 'name',
      searchField: ['first_name', 'last_name', 'email'],
      sortField: [
        { field: 'first_name', direction: 'asc' },
        { field: 'last_name', direction: 'asc' }
      ],
      options: studentsInfo,
      render: {
        item: function (item, escape) {
          var name = formatName(item);
          return '<div>' +
            (name ? '<span class="name">' + escape(name) + '</span>' : '') +
            (item.email ? '<span class="email">' + escape(item.email) + '</span>' : '') +
            '</div>';
        },
        option: function (item, escape) {
          var name = formatName(item);
          var label = name || item.email;
          var caption = name ? item.email : null;
          return '<div>' +
            '<span class="label">' + escape(label) + '</span>' +
            (caption ? '<span class="caption">' + escape(caption) + '</span>' : '') +
            '</div>';
        }
      },
      createFilter: function (input) {
        var regexpA = new RegExp('^' + REGEX_EMAIL + '$', 'i');
        var regexpB = new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i');
        return regexpA.test(input) || regexpB.test(input);
      },
      create: function (input) {
        if ((new RegExp('^' + REGEX_EMAIL + '$', 'i')).test(input)) {
          return { email: input };
        }
        var match = input.match(new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i'));
        if (match) {
          var name = $.trim(match[1]);
          var pos_space = name.indexOf(' ');
          var first_name = name.substring(0, pos_space);
          var last_name = name.substring(pos_space + 1);

          return {
            email: match[2],
            first_name: first_name,
            last_name: last_name
          };
        }
        alert('Invalid email address.');
        return false;
      }
    })

    //
    // Line plot
    //
    var selectize_line = $selectize_line[0].selectize;

    // show current values in multi input dropdown
    $('#line_wrapper select.selectized,#line_wrapper input.selectized').each(function () {
      var $input = $(this);

      var update = function (e) {
        var selectedStudents = $input.val();
        if (selectedStudents) {
          var chosenStudents = [];
          for (var i = 0; i < selectedStudents.length; i++) {
            chosenStudents.push(studentsInfoIndex[selectedStudents[i]]);
          }
          updateLinePlot(chosenStudents)
        }
      }
      $(this).on('change', update);
    });

    function updateLinePlot(chosenStudents) {
      var chosenStudents = chosenStudents || []
      var plotlyLineData = []

      for (var i = 0; i < chosenStudents.length; i++) {
        var studentInfo = studentsInfo[chosenStudents[i]]
        var result = {
          type: "scatter",
          mode: "lines",
          name: studentInfo['first_name'] + " " + studentInfo['last_name'],
          x: (currentLineTab === 'weeks') ? weeksDates : chaptersDates,
          y: (currentLineTab === 'weeks') ? weeksTranspose[chosenStudents[i]] : chaptersTranspose[chosenStudents[i]],
          line: {
            dash: 'solid',
            width: 1
          }
        }
        plotlyLineData.push(result);
      };
      addClassStats(plotlyLineData, currentLineTab)

      var range = (currentLineTab === 'weeks') ?
        [weeksDates[0], weeksDates[weeksDates.length - 1]] :
        [chaptersDates[0], chaptersDates[chaptersDates.length - 1]];
      plotlyLineLayout.xaxis.range = range
      plotlyLineLayout.xaxis.rangeslider.range = range
      plotlyLineLayout.sliders[0].steps = calculateSteps("median", currentLineTab)

      Plotly.react(plotlyLineDiv, plotlyLineData, plotlyLineLayout)
    };

    function stats(arr) {
      var sortedArr = [...arr].sort(Plotly.d3.ascending)
      var q1 = Plotly.d3.quantile(sortedArr, .25)
      var median = Plotly.d3.quantile(sortedArr, .50)
      var q3 = Plotly.d3.quantile(sortedArr, .75)

      return {
        q1: q1,
        median: median,
        q3: q3
      }
    }

    // var arrayColumn = (arr, n) => arr.map(x => x[n]);
    function transpose(m) {
      return m[0].map((x, i) => m.map(x => x[i]))
    }

    var weeksStats = weeksData.map(function (row) { return stats(row) });
    var weeksQ1 = weeksStats.map(function (row) { return row['q1'] });
    var weeksMedian = weeksStats.map(function (row) { return row['median'] });
    var weeksQ3 = weeksStats.map(function (row) { return row['q3'] });

    var chaptersStats = chaptersData.map(function (row) { return stats(row) });
    var chaptersQ1 = chaptersStats.map(function (row) { return row['q1'] });
    var chaptersMedian = chaptersStats.map(function (row) { return row['median'] });
    var chaptersQ3 = chaptersStats.map(function (row) { return row['q3'] });

    var weeksTranspose = transpose(weeksData)
    var chaptersTranspose = transpose(chaptersData)

    function getBelowQuartile(quartile, unit) {
      var belowQuartile = []
      var counts = {};
      var belowQuartileObj = {};
      var data = (unit === 'weeks') ? weeksData : chaptersData;
      var stats = (unit === 'weeks') ? weeksStats : chaptersStats;

      // get all students below quartile
      for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
          if (data[i][j] < stats[i][quartile]) {
            belowQuartile.push(studentsInfo[j]['email'])
          }
        }
      }
      // aggregate
      for (var i = 0; i < belowQuartile.length; i++) {
        var num = belowQuartile[i];
        counts[num] = counts[num] ? counts[num] + 1 : 1;
      }
      // reformat
      for (var key in counts) {
        if (counts[key] in belowQuartileObj) {
          belowQuartileObj[counts[key]].push(key)
        } else {
          belowQuartileObj[counts[key]] = [key]
        }
      }
      return belowQuartileObj
    }

    var plotlyLineDiv = $("#plotlyLineDiv")[0]
    var plotlyLineData = []

    var plotlyLineClassStats = {
      weeks: {
        q1: {
          type: "scatter",
          mode: "lines",
          name: "class_q1",
          x: weeksDates,
          y: weeksQ1,
          line: {
            dash: 'dashdot',
            width: 1,
            color: '#17BE00'
          }
        },
        median: {
          type: "scatter",
          mode: "lines",
          name: "class_median",
          x: weeksDates,
          y: weeksMedian,
          line: {
            dash: 'dashdot',
            width: 2,
            color: '#17BECF'
          }
        },
        q3: {
          type: "scatter",
          mode: "lines",
          name: "class_q3",
          x: weeksDates,
          y: weeksQ3,
          line: {
            dash: 'dashdot',
            width: 1,
            color: '#17BE00'
          }
        }
      },
      chapters: {
        q1: {
          type: "scatter",
          mode: "lines",
          name: "class_q1",
          x: chaptersDates,
          y: chaptersQ1,
          line: {
            dash: 'dashdot',
            width: 1,
            color: '#17BE00'
          }
        },
        median: {
          type: "scatter",
          mode: "lines",
          name: "class_median",
          x: chaptersDates,
          y: chaptersMedian,
          line: {
            dash: 'dashdot',
            width: 2,
            color: '#17BECF'
          }
        },
        q3: {
          type: "scatter",
          mode: "lines",
          name: "class_q3",
          x: chaptersDates,
          y: chaptersQ3,
          line: {
            dash: 'dashdot',
            width: 1,
            color: '#17BE00'
          }
        }
      }
    }

    function addClassStats(arr, buttonName) {
      arr.push(plotlyLineClassStats[buttonName]['q3'])
      arr.push(plotlyLineClassStats[buttonName]['median'])
      arr.push(plotlyLineClassStats[buttonName]['q1'])
    }

    addClassStats(plotlyLineData, 'weeks')

    var belowQuartileObj = {}
    belowQuartileObj['weeks'] = getBelowQuartile('median', 'weeks')
    belowQuartileObj['chapters'] = getBelowQuartile('median', 'chapters')

    function calculateSteps(quartile, unit) {
      var belowQuartileSteps = Object.keys(belowQuartileObj[unit]).map(function (x) { return parseInt(x, 10) })
      belowQuartileSteps.sort(Plotly.d3.descending)

      // calculate steps
      var steps = []
      steps.push({
        label: parseInt(belowQuartileSteps[0]) + 1,
        method: 'skip',
        execute: false
      })

      for (var i = 0; i < belowQuartileSteps.length; i++) {
        var step = {
          label: belowQuartileSteps[i],
          method: 'skip',
          execute: false
        }
        steps.push(step)
      }
      return steps
    }

    var updatemenusLine = [
      {
        buttons: [
          {
            name: 'weeks',
            args: [{ 'title': 'Total Reading time per week.' }],
            label: 'Weeks',
            method: 'update'
          },
          {
            name: 'chapters',
            args: [{ 'title': 'Total Reading time per chapter.' }],
            label: 'Chapters',
            method: 'update'
          }
        ],
        direction: 'left',
        pad: { 'r': 10, 't': 10 },
        showactive: true,
        type: 'buttons',
        x: 1,
        xanchor: 'right',
        y: 1.3,
        yanchor: 'top'
      },
      // {
      //   buttons: [
      //     {
      //       name: 'reset',
      //       label: 'Reset',
      //       method: 'skip',
      //       execute: false
      //     },
      //     {
      //       name: '25',
      //       label: '25th percentile',
      //       method: 'skip',
      //       execute: false
      //     },
      //     {
      //       name: '50',
      //       label: '50th percentile',
      //       method: 'skip',
      //       execute: false
      //     }
      //   ],
      //   direction: 'left',
      //   pad: { 'r': 10, 't': 10 },
      //   showactive: false,
      //   type: 'buttons',
      //   x: 0.05,
      //   xanchor: 'left',
      //   y: 1.2,
      //   yanchor: 'top'
      // }
    ]

    var plotlyLineLayout = {
      title: "OpenDSA Total Reading Time.",
      updatemenus: updatemenusLine,
      xaxis: {
        autorange: true,
        range: [weeksDates[0], weeksDates[weeksDates.length - 1]],
        rangeselector: {
          buttons: [
            { step: "all" }
          ]
        },
        rangeslider: { range: [weeksDates[0], weeksDates[weeksDates.length - 1]] },
        type: "date"
      },
      yaxis: {
        autorange: true,
        type: "linear"
      },
      sliders: [{
        pad: { t: 85 },
        currentvalue: {
          xanchor: "left",
          prefix: "Students with (",
          suffix: ") week(s) below class median.",
          font: {
            color: "#888",
            size: 20
          }
        },
        steps: calculateSteps("median", 'weeks')
      }],
      showlegend: true,
      legend: {
        x: 1.17,
        xanchor: 'right',
        y: 1
      }
    };

    Plotly.newPlot(plotlyLineDiv, plotlyLineData, plotlyLineLayout)
      .then(() => {
        $("#tools-accordion").accordionjs({ closeAble: true });
      })

    plotlyLineDiv.on('plotly_sliderchange', function (e) {
      selectize_line.clear()
      var stepLabel = e.step.label
      var chosenStudents = [];
      var selectedStudents = (Object.keys(belowQuartileObj[currentLineTab]).includes(stepLabel)) ?
        belowQuartileObj[currentLineTab][stepLabel] : [];
      if (selectedStudents) {
        for (var i = 0; i < selectedStudents.length; i++) {
          chosenStudents.push(studentsInfoIndex[selectedStudents[i]]);
        }
      }

      plotlyLineLayout.sliders[0].currentvalue.suffix = (currentLineTab === 'weeks') ? ") week(s) below class median." : ") chapter(s) below class median."
      updateLinePlot(chosenStudents)
    })

    // event handler to select points and show dataTables
    plotlyLineDiv.on('plotly_buttonclicked', function (e) {
      selectize_line.clear()
      var buttonName = e.button.name;

      if (['weeks', 'chapters'].includes(buttonName)) {
        currentLineTab = buttonName;
        plotlyLineLayout.sliders[0].active = 0
        plotlyLineLayout.sliders[0].currentvalue.suffix = (currentLineTab === 'weeks') ? ") week(s) below class median." : ") chapter(s) below class median.";
        updateLinePlot()
      }
    })

  }
  // Plotly.d3.json("https://raw.githubusercontent.com/hosamshahin/OpenDSA-TimeTrackingViz/master/fake_data.json",
  //   function (err, userData) {

  //   })


  //
  // Exercises Lookup
  //
  $.widget("custom.combobox", {
    _create: function () {
      this.wrapper = $("<span>")
        .addClass("custom-combobox")
        .addClass("custom-comb")
        .insertAfter(this.element);

      this.element.hide();
      this._createAutocomplete();
      this._createShowAllButton();
    },

    _createAutocomplete: function () {
      var selected = this.element.children(":selected"),
        value = selected.val() ? selected.text() : "";

      this.input = $("<input>")
        .appendTo(this.wrapper)
        .val(value)
        .attr("title", "")
        .addClass("custom-combobox-input ui-widget ui-widget-content ui-state-default ui-corner-left")
        .addClass("custom-comb-input ui-widget ui-widget-content ui-state-default ui-corner-left")
        .autocomplete({
          delay: 0,
          minLength: 0,
          source: $.proxy(this, "_source")
        })
        .tooltip({
          classes: {
            "ui-tooltip": "ui-state-highlight"
          }
        });

      this._on(this.input, {
        autocompleteselect: function (event, ui) {
          ui.item.option.selected = true;
          this._trigger("select", event, {
            item: ui.item.option
          });
        },

        autocompletechange: "_removeIfInvalid"
      });
    },

    _createShowAllButton: function () {
      var input = this.input,
        wasOpen = false;

      $("<a>")
        .attr("tabIndex", -1)
        .attr("title", "Show All Items")
        .tooltip()
        .appendTo(this.wrapper)
        .button({
          icons: {
            primary: "ui-icon-triangle-1-s"
          },
          text: false
        })
        .removeClass("ui-corner-all")
        .addClass("custom-combobox-toggle ui-corner-right")
        .addClass("custom-comb-toggle ui-corner-right")
        .on("mousedown", function () {
          wasOpen = input.autocomplete("widget").is(":visible");
        })
        .on("click", function () {
          input.trigger("focus");

          // Close if already visible
          if (wasOpen) {
            return;
          }

          // Pass empty string as value to search for, displaying all results
          input.autocomplete("search", "");
        });
    },

    _source: function (request, response) {
      var matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i");
      response(this.element.children("option").map(function () {
        var text = $(this).text();
        if (this.value && (!request.term || matcher.test(text)))
          return {
            label: text,
            value: text,
            option: this
          };
      }));
    },

    _removeIfInvalid: function (event, ui) {

      // Selected an item, nothing to do
      if (ui.item) {
        return;
      }

      // Search for a match (case-insensitive)
      var value = this.input.val(),
        valueLowerCase = value.toLowerCase(),
        valid = false;
      this.element.children("option").each(function () {
        if ($(this).text().toLowerCase() === valueLowerCase) {
          this.selected = valid = true;
          return false;
        }
      });

      // Found a match, nothing to do
      if (valid) {
        return;
      }

      // Remove invalid value
      this.input
        .val("")
        .attr("title", value + " didn't match any item")
        .tooltip("open");
      this.element.val("");
      this._delay(function () {
        this.input.tooltip("close").attr("title", "");
      }, 2500);
      this.input.autocomplete("instance").term = "";
    },

    _destroy: function () {
      this.wrapper.remove();
      this.element.show();
    }
  });
  $(function () {
    // $("#tools-accordion").accordionjs({ closeAble: true });
    $("#combobox").combobox();
    $("#toggle").on("click", function () {
      $("#combobox").toggle();
    });

    $("#comb").combobox();
    $("#toggle").on("click", function () {
      $("#comb").toggle();
    });

    $('#select').click(function () {
      $('#log').html("");
      $('#display_table').html("");
      console.log("clicked registered");
      return handle_select_student();
      //handle_select_student();
      //handle_display()
    });

    $('#btn-select-tool').on('click', function () {

      $('#overview-container').css('display', 'none');
      $('#detail-container').css('display', 'none');
      $('#mst-container').css('display', 'none');
      $('#log').html('');
      $('#display_table').html('');

      switch ($('#select-tool').val()) {
        case "detail":
          $('#detail-container').css('display', '');
          break;
        case "overview":
          $('#overview-container').css('display', '');
          break;
        default:
        //
      }
    });

    $('#btn-select-module').on('click', handle_module_display);

    $('#btn-module-csv').on('click', function () {
      var headers = $('#mst-header-row')[0];
      var tbody = $('#mst-body')[0];
      var csv = table2csv(headers, tbody, [[/ \(\?\)/g, '']]);

      var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(csv);
      var modules = $('#select-module')[0];
      var selectedModule = modules.options[modules.selectedIndex].innerText
        .replace('-', '_')
        .replace(/\./g, '-')
        .replace(/\s/g, '');

      var exportName = selectedModule + '_' + getTimestamp(new Date());
      var downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", exportName + ".csv");
      downloadAnchorNode.style.display = 'none';
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    });
  });
  function getTimestamp(date, format) {
    var format = format || "yyyy-mm-dd"
    var month = date.getMonth() + 1;
    if (month < 10) month = '0' + month;
    var day = date.getDate();
    if (day < 10) day = '0' + day;
    var hour = date.getHours();
    if (hour < 10) hour = '0' + hour;
    var minute = date.getMinutes();
    if (minute < 10) minute = '0' + minute;
    var second = date.getSeconds();
    if (second < 10) second = '0' + second;

    if (format == 'yyyymmdd') {
      return [date.getFullYear(), month, day].join('');
    } else {
      return [date.getFullYear(), month, day].join('-');
    }
  }
  function table2csv(headers, body, replacements) {
    if (!replacements) replacements = [];
    var csv = '';
    for (var i = 0; i < headers.children.length; i++) {
      var cell = headers.children[i];
      var text = cell.innerText;
      for (var j = 0; j < replacements.length; j++) {
        var replacement = replacements[j];
        text = text.replace(replacement[0], replacement[1]);
      }
      csv += '"' + text + '",';
    }
    csv += '\n';

    for (var i = 0; i < body.children.length; i++) {
      var row = body.children[i];
      for (var j = 0; j < row.children.length; j++) {
        var cell = row.children[j];
        csv += '"' + cell.innerText + '",';
      }
      csv += '\n';
    }
    return csv;
  }
  function handle_module_display() {
    var messages = check_dis_completeness("modules_table");
    if (messages.length !== 0) {
      alert(messages);
      $('#display_table').html('');
      return;
    }

    $('#spinner').css('display', '');
    $.ajax({
      url: "/course_offerings/" + ODSA_DATA.course_offering_id + "/modules/" + $('#select-module').val() + "/progresses",
      type: 'get'
    }).done(function (data) {

      var exHeader = $('#exercise-info-header');
      var headers = $('#mst-header-row');
      var tbody = $('#mst-body');
      var exInfoColStartIdx = 8;
      headers.children().slice(exInfoColStartIdx).remove();
      tbody.empty();

      // create a column for each exercise
      var points_possible = 0;
      for (var i = 0; i < data.exercises.length; i++) {
        var ex = data.exercises[i];
        ex.points = parseFloat(ex.points);
        points_possible += ex.points;
        headers.append('<th>' + ex.inst_exercise.name + ' (' + ex.points + 'pts)</th>');
      }
      exHeader.attr('colSpan', data.exercises.length);

      var enrollments = {};
      for (i = 0; i < data.enrollments.length; i++) {
        var enrollment = data.enrollments[i];
        enrollments[enrollment.user_id] = enrollment;
      }

      // create a row for each student
      var html = '';
      for (i = 0; i < data.students.length; i++) {
        var student = data.students[i];
        var have_ex_data = false;
        if (enrollments[student.id]) {
          student = enrollments[student.id].user;
          have_ex_data = true;
        }
        html += '<tr>';
        html += '<td>' + student.first_name + '</td>';
        html += '<td>' + student.last_name + '</td>';
        html += '<td>' + student.email + '</td>';
        if (have_ex_data) {
          var eps = student.odsa_exercise_progresses;
          var mp = student.odsa_module_progresses[0];
          var latest_proficiency = new Date(0);
          var exhtml = '';
          // match up exercises and exercise progresses
          for (var j = 0; j < data.exercises.length; j++) {
            var found = false;
            var ex = data.exercises[j];
            for (var k = 0; k < eps.length; k++) {
              if (ex.id === eps[k].inst_book_section_exercise_id) {
                if (eps[k].highest_score >= ex.threshold) {
                  exhtml += '<td class="success">' + ex.points + '</td>';
                  var pdate = new Date(eps[k].proficient_date);
                  if (pdate > latest_proficiency) {
                    latest_proficiency = pdate;
                  }
                }
                else {
                  exhtml += '<td>0</td>';
                }
                found = true;
                break;
              }
            }
            if (!found) {
              exhtml += '<td>0</td>';
            }
          }
          html += '<td>' + parseFloat((mp.highest_score * points_possible).toFixed(2)) + '</td>';
          html += '<td>' + points_possible + '</td>';
          html += '<td>' + (mp.created_at ? new Date(mp.created_at).toLocaleString() : 'N/A') + '</td>';
          html += '<td>' + (mp.proficient_date ? new Date(mp.proficient_date).toLocaleString() : 'N/A') + '</td>';
          html += '<td>' + (latest_proficiency.getTime() > 0 ? latest_proficiency.toLocaleString() : 'N/A') + '</td>';
          html += exhtml;
        }
        else {
          // student has not attempted any exercise in this module
          html += '<td>0</td> <td>' + points_possible + '</td> <td>N/A</td> <td>N/A</td> <td>N/A</td>';
          for (var j = 0; j < data.exercises.length; j++) {
            html += '<td>0</td>';
          }
        }
        html += '</tr>';
      }
      tbody.append(html);
      $('#mst-container').css('display', '');
    }).fail(function (error) {
      console.log(error);
      try {
        alert('ERROR: ' + JSON.parse(error.responseText).message)
      }
      catch (ex) {
        alert("Failed to retrieve module progress data.\n" + error.responseText);
      }
    }).always(function () {
      $('#spinner').css('display', 'none');
    });
  };
  function handle_display() {
    var messages = check_dis_completeness("table");
    if (messages.length !== 0) {
      alert(messages);
      $('#display_table').html('');
      return;
    }
    //GET /course_offerings/:user_id/:inst_section_id
    var request = "/course_offerings/" + $('#combobox').find('option:selected').val() + "/" + $('#comb').find('option:selected').val();
    $('#spinner').css('display', '');
    var aj = $.ajax({
      url: request,
      type: 'get',
      data: $(this).serialize()
    }).done(function (data) {
      if (data.odsa_exercise_progress.length == 0 || data.odsa_exercise_attempts.length == 0) {
        var p = '<p style="font-size:24px; align=center;"> You have not Attempted this exercise <p>';
        $('#display_table').html(p);
      } else if (data.odsa_exercise_attempts[0].pe_score != null || data.odsa_exercise_attempts[0].pe_steps_fixed != null) {

        var khan_ac_exercise = true;
        var header = '<p style="font-size:24px; align=center;"> OpenDSA Progress Table<p>';
        header += '<table class="table"><thead>';
        var elem = '<tbody>';
        header += buildProgressHeader(khan_ac_exercise) + "</thead>";
        elem += getFieldMember(data.inst_section, data.odsa_exercise_progress[0], data.odsa_exercise_attempts, data.inst_book_section_exercise, khan_ac_exercise);
        var header1 = '<p style="font-size:24px; align=center;"> OpenDSA Attempt Table' + data.odsa_exercise_attempts[0].question_name + '<p>';
        header1 += '<table class="table"><thead>';
        var elem1 = '<tbody>';
        header1 += getAttemptHeader(khan_ac_exercise) + "</thead>";
        var proficiencyFlag = -1;
        for (var i = 0; i < data.odsa_exercise_attempts.length; i++) {
          if (data.odsa_exercise_attempts[i].earned_proficiency != null && data.odsa_exercise_attempts[i].earned_proficiency && proficiencyFlag == -1) {
            proficiencyFlag = 1;
            elem1 += getAttemptMemeber(data.odsa_exercise_attempts[i], proficiencyFlag, khan_ac_exercise);
            proficiencyFlag = 2;
          } else {
            elem1 += getAttemptMemeber(data.odsa_exercise_attempts[i], proficiencyFlag, khan_ac_exercise);
          }
        }
        header1 += elem1;
        header += elem;
        header += '</tbody></table> ';
        header1 += '</tbody></table>';
        header += '<br>' + header1;
        $('#display_table').html(header);
      } else {

        var header = '<p style="font-size:24px; align=center;"> OpenDSA Progress Table<p>';
        header += '<table class="table table-bordered"><thead>';
        var elem = '<tbody>';
        header += buildProgressHeader() + '</thead>';
        elem += getFieldMember(data.inst_section, data.odsa_exercise_progress[0], data.odsa_exercise_attempts, data.inst_book_section_exercise);
        var header1 = '<p style="font-size:24px; align=center;"> OpenDSA Attempt Table <p>';
        header1 += '<table class="table table-bordered table-hover"><thead>';
        var elem1 = '<tbody>';
        header1 += getAttemptHeader() + '</thead>';
        var proficiencyFlag = -1;
        for (var i = 0; i < data.odsa_exercise_attempts.length; i++) {
          if (data.odsa_exercise_attempts[i].earned_proficiency != null && data.odsa_exercise_attempts[i].earned_proficiency && proficiencyFlag == -1) {
            proficiencyFlag = 1;
            elem1 += getAttemptMemeber(data.odsa_exercise_attempts[i], proficiencyFlag);
            proficiencyFlag = 2;
          } else {
            elem1 += getAttemptMemeber(data.odsa_exercise_attempts[i], proficiencyFlag);
          }
        }
        header1 += elem1;
        header += elem;
        header += '</tbody></table> ';
        header1 += '</tbody></table>';
        header += '<br>' + header1;
        $('#display_table').html(header);
      }

      //change_courses(data);
    }).fail(function (data) {
      alert("failure");
      console.log('AJAX request has FAILED');
    }).always(function () {
      $('#spinner').css('display', 'none');
    });
  };
  function getFieldMember(sData, pData, attempts, instBookSecEx, kahn_ex) {
    // console.dir(pData)
    var member = '<tr>';
    var pointsEarned = pData.proficient_date ? instBookSecEx.points : 0;
    if (kahn_ex == null || kahn_ex == false) {
      member += '<td>' + pData.current_score + '</td>';
      member += '<td>' + pData.highest_score + '</td>';
    }
    member += '<td>' + pData.total_correct + '</td>';
    member += '<td>' + attempts.length + '</td>';
    member += '<td>' + pointsEarned + '</td>';
    member += '<td>' + instBookSecEx.points + '</td>';
    if (pData.proficient_date != null) {
      member += '<td>' + pData.proficient_date.substring(0, 10) + " " + pData.proficient_date.substring(11, 16) + '</td>';
    } else {
      member += '<td>N/A</td>';
    }
    member += '<td>' + pData.first_done.substring(0, 10) + " " + pData.first_done.substring(11, 16) + '</td>';
    member += '<td>' + pData.last_done.substring(0, 10) + " " + pData.last_done.substring(11, 16) + '</td>';
    //member += '<td>' + sData.lms_posted + '</td>';
    //member += '<td>' + sData.time_posted + '</td>';
    return member;
  };
  function buildProgressHeader(kahn_ex) {
    var elem = '<tr>';
    if (kahn_ex == null || kahn_ex == false) {
      elem += '<th>Current Score</th>';
      elem += '<th>Highest Score</th>';
    }
    elem += '<th>Total Correct</th>';
    elem += '<th>Total Attempts</th>';
    elem += '<th>Points Earned</th>';
    elem += '<th>Points Possible</th>';
    elem += '<th>Proficient Date</th>';
    elem += '<th>First Done</th>';
    elem += '<th>Last Done</th>';
    //elem += '<th>Posted to Canvas?</th>';
    //elem += '<th>Time Posted</th></tr>';

    return elem;
  };
  function getAttemptHeader(kahn_ex) {
    var head = '<tr>';
    if (kahn_ex == null || kahn_ex == false) {
      head += '<th>Question name</th>';
      head += '<th>Request Type</th>';
    } else {
      head += '<th>Pe Score</th>';
      head += '<th>Pe Steps</th>';
    }
    head += '<th>Correct</th>';
    head += '<th>Worth Credit</th>';
    head += '<th>Time Done</th>';
    head += '<th>Time Taken (s)</th>';
    return head;
  };
  function getAttemptMemeber(aData, j, kahn_ex) {
    var memb = "<tr>";
    //console.dir(aData.earned_proficiency + " and j = " + j)
    if (kahn_ex == null || kahn_ex == false) {
      memb = '';
      if (aData.earned_proficiency != null && j == 1) {
        memb += '<tr class="success"><td>' + aData.question_name + '</td>';
      } else {
        memb += '<tr><td>' + aData.question_name + '</td>';
      }
      memb += '<td>' + aData.request_type + '</td>';
    } else {
      memb += '<td>' + aData.pe_score + '</td>';
      memb += '<td>' + aData.pe_steps_fixed + '</td>';
    }

    memb += '<td>' + aData.correct + '</td>';
    memb += '<td>' + aData.worth_credit + '</td>';
    memb += '<td>' + aData.time_done.substring(0, 10) + " " + aData.time_done.substring(11, 16) + '</td>';
    memb += '<td>' + aData.time_taken + '</td>';

    return memb;


  };
  function handle_select_student() {
    var messages = check_dis_completeness("individual_student");
    if (messages.length !== 0) {
      alert(messages);
      return;
    }
    //GET /course_offerings/:user_id/course_offering_id/exercise_list
    var al = $('#combobox').find('option:selected').val();
    var request = "/course_offerings/" + $('#combobox').find('option:selected').val() + "/" + document.getElementById('select').name + "/exercise_list";
    $('#spinner').css('display', '');
    var aj = $.ajax({
      url: request,
      type: 'get',
      data: $(this).serialize()
    }).done(function (data) {
      if (data.odsa_exercise_attempts.length === 0) {
        var p = '<p style="font-size:24px; align=center;"> Select a student name <p>';
        $('#log').html(p);
      } else {
        //$('#log').html(p);

        //$('#log').html("<%= j render(partial: 'show_individual_exercise') %>")
        //<%= escape_javascript(render(:partial => 'lti/show_individual_exercise.html.haml')) %>");
        //.append("<%= j render(:partial => 'views/lti/show_individual_exercise') %>");
        //var elem = '<div class="ui-widget">';
        var elem = '<label class="control-label col-lg-2 col-sm-3">Select Exercise:</label>';
        elem += '<div class="col-xs-6"><select id="comb" class="form-control">';
        //elem += '<% @exercise_list.each do |k, q| %>';
        //elem += '<% if q[1] %>';
        var keys = Object.keys(data.odsa_exercise_attempts);
        var attempt_flag = false;
        for (var i = 0; i < keys.length; i++) {
          var exercise = data.odsa_exercise_attempts[keys[i]];
          if (exercise.length > 1) {
            attempt_flag = true
            elem += ' <option value="' + keys[i] + '">';
            elem += '<strong>' + exercise[0] + '</strong>';
            elem += '</option>';
          }
        }
        if (!attempt_flag) {
          elem += ' <option value="No_attempt">';
          elem += '<strong> No Attempts Made</strong>';
          elem += '</option>';
        }
        elem += '</select></div>';
        if (attempt_flag) {
          elem += '<input class="btn btn-primary" id="display" onclick="handle_display()" name="display" type="button" value="Display Detail"></input>';
        }
        $('#log').html(elem);

      }
      //change_courses(data);
    }).fail(function (data) {
      alert("failure");
      console.log('AJAX request has FAILED');
    }).always(function () {
      $('#spinner').css('display', 'none');
    });
  }
  function check_dis_completeness(flag) {
    var messages;
    messages = [];
    var selectbar1 = $('#combobox').find('option:selected').text();
    switch (flag) {
      case 'individual_student':
        if (selectbar1 === '') {
          messages.push("You need to select a student");
          return messages;
        }
        break;
      case 'table':
        var selectbar2 = $('#comb').find('option:selected').text();
        if (selectbar1 === '' || selectbar2 === '') {
          messages.push("You need to select a student or assignment");
          return messages;
        }
        break;
      case 'modules_table':
        if (!$("#select-module").val()) {
          messages.push('You need to select a module');
          return messages;
        }
        break;
      default:
        console.log("unknown error from odsa_tools.js module");
        alert("unknown error from odsa_tools.js module, written by: Souleymane Dia");
    }

    return messages;
  };
});
